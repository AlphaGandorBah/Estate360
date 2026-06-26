"""Listing views: CRUD, submit, admin decision, saved, preferences."""
import structlog
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole, IsOwnerOrReadOnly, IsTenant, IsVerifiedLandlord
from apps.common.throttles import ReadThrottle

from .filters import ListingFilter
from .models import (
    Listing,
    ListingAdminView,
    ListingStatus,
    SavedListing,
    SearchPreference,
    UserInteraction,
)
from .serializers import (
    ListingAdminSerializer,
    ListingDecisionSerializer,
    ListingReadSerializer,
    ListingWriteSerializer,
    SavedListingSerializer,
    SearchPreferenceSerializer,
)
from .tasks import send_listing_decision_email, update_search_vector

logger = structlog.get_logger(__name__)


class ListingListCreateView(IdempotencyMixin, APIView):
    """GET /listings  (public) — POST /listings  (verified landlord)."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsVerifiedLandlord()]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return super().get_throttles()

    def get(self, request: Request) -> Response:
        if request.GET.get("my") == "true" and request.user.is_authenticated:
            qs = Listing.objects.filter(owner=request.user).exclude(
                status=ListingStatus.ARCHIVED
            ).select_related("owner")
        else:
            qs = Listing.objects.filter(status=ListingStatus.APPROVED).select_related("owner")
        f = ListingFilter(request.GET, queryset=qs)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(f.qs, request)
        return paginator.get_paginated_response(ListingReadSerializer(page, many=True).data)

    def post(self, request: Request) -> Response:
        if request.user.is_restricted:
            return Response(
                {"code": "restricted", "detail": "Your account is restricted from creating listings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = ListingWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        listing = serializer.save(owner=request.user)

        # Update search vector async
        update_search_vector.apply_async(args=[listing.pk])

        response = Response(ListingReadSerializer(listing).data, status=status.HTTP_201_CREATED)
        self.finalize_idempotency(request, response)
        return response


class ListingDetailView(APIView):
    """GET /listings/{id}, PATCH /listings/{id}, DELETE /listings/{id}."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated(), IsOwnerOrReadOnly()]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return super().get_throttles()

    def _get_listing(self, pk: int):
        try:
            return Listing.objects.select_related("owner").get(pk=pk)
        except Listing.DoesNotExist:
            return None

    def get(self, request: Request, pk: int) -> Response:
        listing = self._get_listing(pk)
        if not listing or listing.status == ListingStatus.ARCHIVED:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.is_authenticated:
            if request.user.role == User.ROLE_ADMIN:
                # Moderation view, not a tenant interest signal — tracked
                # separately so it never feeds the recommender, and so the
                # admin decision endpoint can require it happened first.
                ListingAdminView.objects.get_or_create(listing=listing, admin=request.user)
            else:
                # Log view interaction (deduplicated per user per 24h)
                cutoff = timezone.now() - timezone.timedelta(hours=24)
                if not UserInteraction.objects.filter(
                    user=request.user, listing=listing,
                    event_type=UserInteraction.EVENT_VIEW, created_at__gte=cutoff,
                ).exists():
                    UserInteraction.objects.create(
                        user=request.user, listing=listing, event_type=UserInteraction.EVENT_VIEW
                    )

        return Response(ListingReadSerializer(listing).data)

    def patch(self, request: Request, pk: int) -> Response:
        listing = self._get_listing(pk)
        if not listing:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, listing)
        if listing.status != ListingStatus.DRAFT:
            return Response(
                {"code": "not_editable", "detail": "Only draft listings can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ListingWriteSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        update_search_vector.apply_async(args=[listing.pk])
        return Response(ListingReadSerializer(listing).data)

    def delete(self, request: Request, pk: int) -> Response:
        listing = self._get_listing(pk)
        if not listing:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, listing)
        listing.status = ListingStatus.ARCHIVED
        listing.save(update_fields=["status"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListingSubmitView(IdempotencyMixin, APIView):
    """POST /listings/{id}/submit"""

    permission_classes = [IsVerifiedLandlord]

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        try:
            listing = Listing.objects.get(pk=pk, owner=request.user)
        except Listing.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if listing.status != ListingStatus.DRAFT:
            return Response(
                {"code": "invalid_status", "detail": "Only draft listings can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Requires at least one ready panorama
        if not listing.panoramas.filter(status="ready").exists():
            return Response(
                {"code": "no_panorama", "detail": "At least one ready panorama is required before submitting."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        listing.status = ListingStatus.PENDING
        listing.save(update_fields=["status"])

        response = Response(ListingReadSerializer(listing).data)
        self.finalize_idempotency(request, response)
        return response


class AdminListingListView(APIView):
    """GET /admin/listings — moderation queue, filterable by ?status= (defaults to pending)."""
    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        status_param = request.GET.get("status", ListingStatus.PENDING)
        if status_param not in ListingStatus.values:
            return Response(
                {"code": "invalid_status", "detail": f"status must be one of {ListingStatus.values}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = Listing.objects.filter(status=status_param).select_related("owner").order_by("created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        data = ListingAdminSerializer(page, many=True, context={"request": request}).data
        return paginator.get_paginated_response(data)


class AdminListingDecisionView(IdempotencyMixin, APIView):
    """POST /admin/listings/{id}/decision"""
    permission_classes = [IsAdminRole]

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        try:
            listing = Listing.objects.select_related("owner").get(pk=pk)
        except Listing.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if not ListingAdminView.objects.filter(listing=listing, admin=request.user).exists():
            return Response(
                {"code": "not_viewed", "detail": "View the property before approving or rejecting it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ListingDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["decision"]
        notes = serializer.validated_data.get("notes", "")

        listing.status = ListingStatus.APPROVED if decision == "approved" else ListingStatus.REJECTED
        listing.reviewed_by = request.user
        listing.reviewed_at = timezone.now()
        listing.rejection_notes = notes
        listing.save()

        send_listing_decision_email.apply_async(
            args=[listing.pk, decision, notes],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        # Create notification for owner
        from apps.notifications.utils import create_notification
        create_notification(
            user=listing.owner,
            notif_type="listing_decision",
            payload={"listing_id": listing.pk, "decision": decision, "notes": notes},
        )

        response = Response(ListingAdminSerializer(listing).data)
        self.finalize_idempotency(request, response)
        return response


class AdminListingDeleteView(APIView):
    """DELETE /admin/listings/{id} — takedown for any listing, regardless of status."""
    permission_classes = [IsAdminRole]

    def delete(self, request: Request, pk: int) -> Response:
        try:
            listing = Listing.objects.get(pk=pk)
        except Listing.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if not ListingAdminView.objects.filter(listing=listing, admin=request.user).exists():
            return Response(
                {"code": "not_viewed", "detail": "View the property before deleting it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        listing.status = ListingStatus.ARCHIVED
        listing.save(update_fields=["status"])

        from apps.common.models import AdminActionLog
        AdminActionLog.objects.create(
            admin=request.user,
            action=AdminActionLog.ACTION_DELETE_LISTING,
            target_listing=listing,
            notes=request.data.get("notes", ""),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SaveListingView(IdempotencyMixin, APIView):
    """POST /listings/{id}/save   DELETE /listings/{id}/save"""
    permission_classes = [IsTenant]

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        try:
            listing = Listing.objects.get(pk=pk, status=ListingStatus.APPROVED)
        except Listing.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        saved, created = SavedListing.objects.get_or_create(tenant=request.user, listing=listing)
        if created:
            UserInteraction.objects.create(
                user=request.user, listing=listing, event_type=UserInteraction.EVENT_SAVE
            )
            # Trigger on-demand recommendation recompute
            from apps.recommendations.tasks import recompute_user_vector
            recompute_user_vector.apply_async(args=[str(request.user.pk)], countdown=30)

        response = Response(
            SavedListingSerializer(saved).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
        self.finalize_idempotency(request, response)
        return response

    def delete(self, request: Request, pk: int) -> Response:
        SavedListing.objects.filter(tenant=request.user, listing_id=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SavedListingsView(APIView):
    """GET /saved"""
    permission_classes = [IsTenant]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        qs = (
            SavedListing.objects.filter(tenant=request.user)
            .select_related("listing__owner")
            .order_by("-created_at")
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(SavedListingSerializer(page, many=True).data)
