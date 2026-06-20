"""REST views for conversations and messages."""
import structlog
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import MessageCursorPagination, StandardPagination
from apps.common.permissions import IsConversationParticipant, IsTenant
from apps.common.throttles import MessagingThrottle, ReadThrottle
from apps.listings.models import UserInteraction

from .models import Conversation, Message
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    StartConversationSerializer,
)

logger = structlog.get_logger(__name__)


class ConversationListView(IdempotencyMixin, APIView):
    """GET /conversations   POST /conversations"""

    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return [MessagingThrottle()]

    def get(self, request: Request) -> Response:
        user = request.user
        if user.role == User.ROLE_TENANT:
            qs = Conversation.objects.filter(tenant=user)
        elif user.role == User.ROLE_LANDLORD:
            qs = Conversation.objects.filter(landlord=user)
        else:
            qs = Conversation.objects.filter(tenant=user) | Conversation.objects.filter(landlord=user)

        qs = qs.select_related("tenant", "landlord", "listing").order_by("-last_message_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            ConversationSerializer(page, many=True, context={"request": request}).data
        )

    def post(self, request: Request) -> Response:
        if request.user.role != User.ROLE_TENANT:
            return Response(
                {"code": "forbidden", "detail": "Only tenants can start conversations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = StartConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        landlord_id = serializer.validated_data["landlord_id"]
        listing_id = serializer.validated_data.get("listing_id")
        initial_message = serializer.validated_data.get("initial_message", "")

        try:
            landlord = User.objects.get(pk=landlord_id, role=User.ROLE_LANDLORD, is_active=True)
        except User.DoesNotExist:
            return Response({"code": "not_found", "detail": "Landlord not found."}, status=status.HTTP_404_NOT_FOUND)

        listing = None
        if listing_id:
            from apps.listings.models import Listing
            try:
                listing = Listing.objects.get(pk=listing_id)
            except Listing.DoesNotExist:
                return Response({"code": "not_found", "detail": "Listing not found."}, status=status.HTTP_404_NOT_FOUND)

        conv, created = Conversation.objects.get_or_create(
            tenant=request.user, landlord=landlord, listing=listing
        )

        if created and initial_message:
            Message.objects.create(
                conversation=conv, sender=request.user, body=initial_message
            )
            conv.last_message_at = timezone.now()
            conv.save(update_fields=["last_message_at"])

            if listing:
                UserInteraction.objects.create(
                    user=request.user, listing=listing, event_type=UserInteraction.EVENT_INQUIRY
                )

        response = Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
        self.finalize_idempotency(request, response)
        return response


class MessageView(IdempotencyMixin, APIView):
    """
    GET  /conversations/{id}/messages  — paginated history
    POST /conversations/{id}/messages  — send message (REST fallback)
    """
    permission_classes = [IsAuthenticated, IsConversationParticipant]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return [MessagingThrottle()]

    def _get_conv(self, pk: int):
        try:
            return Conversation.objects.get(pk=pk)
        except Conversation.DoesNotExist:
            return None

    def get(self, request: Request, pk: int) -> Response:
        conv = self._get_conv(pk)
        if not conv:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, conv)
        qs = conv.messages.select_related("sender").order_by("-created_at")
        paginator = MessageCursorPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(MessageSerializer(page, many=True).data)

    def post(self, request: Request, pk: int) -> Response:
        conv = self._get_conv(pk)
        if not conv:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, conv)

        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        body = serializer.validated_data["body"]
        client_key = serializer.validated_data.get("client_key")

        # Deduplicate against WS path via client_key
        if client_key:
            existing = Message.objects.filter(conversation=conv, client_key=client_key).first()
            if existing:
                response = Response(MessageSerializer(existing).data, status=status.HTTP_200_OK)
                self.finalize_idempotency(request, response)
                return response

        msg = Message.objects.create(
            conversation=conv, sender=request.user, body=body, client_key=client_key
        )
        conv.last_message_at = timezone.now()
        conv.save(update_fields=["last_message_at"])

        # Push over channel layer
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"conversation_{pk}",
                {
                    "type": "chat_message",
                    "payload": {
                        "type": "message.new",
                        "id": msg.id,
                        "sender_id": str(request.user.id),
                        "body": msg.body,
                        "created_at": msg.created_at.isoformat(),
                        "client_key": str(msg.client_key) if msg.client_key else None,
                    },
                },
            )

        response = Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)
        self.finalize_idempotency(request, response)
        return response
