"""Admin overview: registered user directory + dashboard stats."""
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import LandlordVerification, User
from apps.accounts.serializers import AdminUserSerializer
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole
from apps.common.throttles import ReadThrottle


class AdminUserListView(APIView):
    """GET /admin/users — directory of registered users."""

    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        qs = User.objects.filter(deleted_at__isnull=True).order_by("-date_joined")
        role = request.GET.get("role")
        if role:
            qs = qs.filter(role=role)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminUserSerializer(page, many=True).data)


class AdminStatsView(APIView):
    """GET /admin/stats — counts for the admin dashboard cards."""

    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        from apps.listings.models import Listing, ListingStatus
        from apps.messaging.models import Conversation
        from apps.moderation.models import FraudReport

        return Response({
            "total_users": User.objects.filter(deleted_at__isnull=True).count(),
            "active_listings": Listing.objects.filter(status=ListingStatus.APPROVED).count(),
            "pending_listings": Listing.objects.filter(status=ListingStatus.PENDING).count(),
            "pending_verifications": LandlordVerification.objects.filter(
                status=LandlordVerification.STATUS_PENDING
            ).count(),
            "open_reports": FraudReport.objects.filter(status=FraudReport.STATUS_OPEN).count(),
            "total_conversations": Conversation.objects.count(),
        })
