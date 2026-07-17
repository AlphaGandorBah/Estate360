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
from apps.common.permissions import IsConversationParticipant
from apps.common.throttles import MessagingThrottle, ReadThrottle
from apps.listings.models import UserInteraction

from .models import Conversation, Message
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    StartConversationSerializer,
)
from .utils import notify_new_message

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
        if user.role == User.ROLE_ADMIN:
            qs = Conversation.objects.filter(is_support=True)
        elif user.role in User.PROPERTY_PROVIDER_ROLES:
            qs = Conversation.objects.filter(landlord=user) | Conversation.objects.filter(
                initiator=user, is_support=True
            )
        else:
            qs = Conversation.objects.filter(initiator=user)

        qs = qs.select_related("initiator", "landlord", "listing").order_by("-last_message_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            ConversationSerializer(page, many=True, context={"request": request}).data
        )

    def post(self, request: Request) -> Response:
        user = request.user
        if user.role == User.ROLE_ADMIN:
            return Response(
                {"code": "forbidden", "detail": "Admins can reply to support conversations but can't start new ones."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user.is_restricted:
            return Response(
                {"code": "restricted", "detail": "Your account is restricted from messaging."},
                status=status.HTTP_403_FORBIDDEN,
            )

        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = StartConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        initial_message = serializer.validated_data.get("initial_message", "")

        if serializer.validated_data.get("support"):
            conv, created = Conversation.objects.get_or_create(initiator=user, is_support=True)
            listing = None
        else:
            if user.role != User.ROLE_TENANT:
                return Response(
                    {
                        "code": "forbidden",
                        "detail": "Only tenants can start conversations with a property provider.",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            provider_id = serializer.validated_data.get("provider_id")
            landlord_id = serializer.validated_data.get("landlord_id")
            if provider_id and landlord_id and provider_id != landlord_id:
                return Response(
                    {
                        "code": "provider_mismatch",
                        "detail": "provider_id and landlord_id must identify the same user.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            requested_provider_id = provider_id or landlord_id
            listing_id = serializer.validated_data.get("listing_id")

            listing = None
            if listing_id:
                from apps.listings.models import Listing, ListingStatus

                try:
                    listing = Listing.objects.select_related("owner").get(
                        pk=listing_id,
                        status=ListingStatus.APPROVED,
                        owner__is_active=True,
                        owner__deleted_at__isnull=True,
                        owner__role__in=User.PROPERTY_PROVIDER_ROLES,
                    )
                except Listing.DoesNotExist:
                    return Response(
                        {"code": "not_found", "detail": "Approved listing not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                landlord = listing.owner
                if requested_provider_id and requested_provider_id != landlord.pk:
                    return Response(
                        {
                            "code": "provider_mismatch",
                            "detail": "The selected provider does not own this listing.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                if not requested_provider_id:
                    return Response(
                        {
                            "code": "invalid",
                            "detail": "provider_id is required when listing_id is not provided.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                try:
                    landlord = User.objects.get(
                        pk=requested_provider_id,
                        role__in=User.PROPERTY_PROVIDER_ROLES,
                        is_active=True,
                        deleted_at__isnull=True,
                    )
                except User.DoesNotExist:
                    return Response(
                        {"code": "not_found", "detail": "Property provider not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            conv, created = Conversation.objects.get_or_create(
                initiator=user, landlord=landlord, listing=listing
            )

        if created and initial_message:
            Message.objects.create(
                conversation=conv, sender=user, body=initial_message
            )
            conv.last_message_at = timezone.now()
            conv.save(update_fields=["last_message_at"])
            notify_new_message(conv, user)

            if listing:
                UserInteraction.objects.create(
                    user=user, listing=listing, event_type=UserInteraction.EVENT_INQUIRY
                )

        response = Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
        self.finalize_idempotency(request, response)
        return response


class ConversationDetailView(APIView):
    """GET /conversations/{id}"""

    permission_classes = [IsAuthenticated, IsConversationParticipant]
    throttle_classes = [ReadThrottle]

    def get(self, request: Request, pk: int) -> Response:
        try:
            conv = Conversation.objects.select_related("initiator", "landlord", "listing").get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, conv)
        return Response(ConversationSerializer(conv, context={"request": request}).data)


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
        if request.user.is_restricted:
            return Response(
                {"code": "restricted", "detail": "Your account is restricted from messaging."},
                status=status.HTTP_403_FORBIDDEN,
            )

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

        # Push over channel layer — best-effort: the message is already
        # persisted, so a channel-layer hiccup (e.g. Redis unreachable)
        # should degrade to "recipient needs to refresh," not fail the send.
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            try:
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
            except Exception as exc:
                logger.warning("ws_broadcast_failed", error=str(exc), conversation_id=pk)

        notify_new_message(conv, request.user)

        response = Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)
        self.finalize_idempotency(request, response)
        return response
