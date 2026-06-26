"""Admin overview: registered user directory, user moderation actions, dashboard stats."""
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import EmailOTP, LandlordVerification, User
from apps.accounts.otp import create_otp
from apps.accounts.serializers import AdminUserSerializer
from apps.accounts.tasks import send_otp_email_task
from apps.common.idempotency import IdempotencyMixin
from apps.common.models import AdminActionLog
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole
from apps.common.serializers import AdminActionLogSerializer
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


class AdminUserActionView(IdempotencyMixin, APIView):
    """POST /admin/users/{id}/action — ban, unban, restrict, unrestrict, or reset_password."""

    permission_classes = [IsAdminRole]
    ACTIONS_TO_LOG = {
        "ban": AdminActionLog.ACTION_BAN_USER,
        "unban": AdminActionLog.ACTION_UNBAN_USER,
        "restrict": AdminActionLog.ACTION_RESTRICT_USER,
        "unrestrict": AdminActionLog.ACTION_UNRESTRICT_USER,
        "reset_password": AdminActionLog.ACTION_RESET_PASSWORD,
    }

    def post(self, request: Request, pk) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        action = request.data.get("action")
        if action not in self.ACTIONS_TO_LOG:
            return Response(
                {"code": "invalid_action", "detail": f"action must be one of {sorted(self.ACTIONS_TO_LOG)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target = User.objects.get(pk=pk, deleted_at__isnull=True)
        except (User.DoesNotExist, ValueError):
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if target.pk == request.user.pk:
            return Response(
                {"code": "invalid_target", "detail": "You cannot perform this action on your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.role == User.ROLE_ADMIN:
            return Response(
                {"code": "invalid_target", "detail": "Admin accounts cannot be managed from this panel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == "ban":
            target.is_active = False
            target.save(update_fields=["is_active"])
        elif action == "unban":
            target.is_active = True
            target.save(update_fields=["is_active"])
        elif action == "restrict":
            target.is_restricted = True
            target.save(update_fields=["is_restricted"])
        elif action == "unrestrict":
            target.is_restricted = False
            target.save(update_fields=["is_restricted"])
        else:  # reset_password — reuses the same self-service OTP email flow
            otp = create_otp(target.email, EmailOTP.PURPOSE_RESET)
            send_otp_email_task.apply_async(
                args=[target.email, otp.code, EmailOTP.PURPOSE_RESET],
                headers={"request_id": getattr(request, "request_id", "-")},
            )

        AdminActionLog.objects.create(
            admin=request.user,
            action=self.ACTIONS_TO_LOG[action],
            target_user=target,
            notes=request.data.get("notes", ""),
        )

        response = Response(AdminUserSerializer(target).data)
        self.finalize_idempotency(request, response)
        return response


class AdminUserDeleteView(APIView):
    """DELETE /admin/users/{id} — soft-deletes a user, mirroring self-service account deletion."""

    permission_classes = [IsAdminRole]

    def delete(self, request: Request, pk) -> Response:
        try:
            target = User.objects.get(pk=pk, deleted_at__isnull=True)
        except (User.DoesNotExist, ValueError):
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if target.pk == request.user.pk:
            return Response(
                {"code": "invalid_target", "detail": "You cannot delete your own account from this panel."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.role == User.ROLE_ADMIN:
            return Response(
                {"code": "invalid_target", "detail": "Admin accounts cannot be managed from this panel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target.listings.filter(status="draft").delete()
        target.listings.filter(status__in=["approved", "pending"]).update(status="archived")
        target.soft_delete()

        AdminActionLog.objects.create(
            admin=request.user,
            action=AdminActionLog.ACTION_DELETE_USER,
            target_user=target,
            notes=request.data.get("notes", ""),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminActionLogListView(APIView):
    """GET /admin/action-log — audit trail of admin moderation actions."""

    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        qs = AdminActionLog.objects.select_related("admin", "target_user", "target_listing").all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(AdminActionLogSerializer(page, many=True).data)


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
            # Scoped to support threads, not Conversation.objects.count() —
            # that's what /conversations actually shows an admin (a shared
            # support inbox), so the card should match what clicking it shows.
            "support_conversations": Conversation.objects.filter(is_support=True).count(),
        })
