"""Fraud report views."""
import structlog
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole
from apps.common.throttles import MessagingThrottle, ReadThrottle

from .models import FraudReport
from .serializers import FraudReportSerializer, ReportDecisionSerializer, SubmitReportSerializer
from .tasks import send_report_update_email

logger = structlog.get_logger(__name__)


class FraudReportSubmitView(IdempotencyMixin, APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [MessagingThrottle]
    throttle_scope = "messaging"

    def post(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        serializer = SubmitReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        listing = None
        reported_user = None

        if data.get("listing_id"):
            from apps.listings.models import Listing
            try:
                listing = Listing.objects.get(pk=data["listing_id"])
            except Listing.DoesNotExist:
                pass

        if data.get("reported_user_id"):
            if str(data["reported_user_id"]) == str(request.user.id):
                return Response(
                    {"code": "self_report", "detail": "You can't report yourself."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                reported_user = User.objects.get(pk=data["reported_user_id"])
            except User.DoesNotExist:
                pass

        report = FraudReport.objects.create(
            reporter=request.user,
            listing=listing,
            reported_user=reported_user,
            reason=data["reason"],
            description=data["description"],
        )

        response = Response(FraudReportSerializer(report).data, status=status.HTTP_201_CREATED)
        self.finalize_idempotency(request, response)
        return response


class AdminReportListView(APIView):
    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    STATUS_FILTERS = {
        "open": [FraudReport.STATUS_OPEN, FraudReport.STATUS_REVIEWING],
        "resolved": [FraudReport.STATUS_RESOLVED],
        "dismissed": [FraudReport.STATUS_DISMISSED],
    }

    def get(self, request: Request) -> Response:
        status_param = request.GET.get("status", "open")
        if status_param not in self.STATUS_FILTERS:
            return Response(
                {"code": "invalid_status", "detail": f"status must be one of {sorted(self.STATUS_FILTERS)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = FraudReport.objects.filter(
            status__in=self.STATUS_FILTERS[status_param]
        ).select_related("reporter", "listing", "reported_user").order_by("created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(FraudReportSerializer(page, many=True).data)


class AdminReportDecisionView(IdempotencyMixin, APIView):
    permission_classes = [IsAdminRole]

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        try:
            report = FraudReport.objects.get(pk=pk)
        except FraudReport.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ReportDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        action = serializer.validated_data.get("action")
        notes = serializer.validated_data.get("notes", "")

        warn_target = report.reported_user or (report.listing.owner if report.listing else None)
        if action == "remove_listing" and not report.listing:
            return Response(
                {"code": "no_listing", "detail": "This report has no listing attached to remove."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if action == "warn" and not warn_target:
            return Response(
                {"code": "no_target", "detail": "This report has no reported user or listing owner to warn."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report.status = decision
        report.handled_by = request.user
        report.resolved_at = timezone.now()
        report.resolution_notes = notes
        report.save()

        from apps.common.models import AdminActionLog
        from apps.notifications.models import Notification
        from apps.notifications.utils import create_notification

        if action == "remove_listing":
            from apps.listings.models import ListingStatus
            report.listing.status = ListingStatus.ARCHIVED
            report.listing.save(update_fields=["status"])
            AdminActionLog.objects.create(
                admin=request.user, action=AdminActionLog.ACTION_DELETE_LISTING,
                target_listing=report.listing,
                notes=f"Removed via fraud report #{report.pk}" + (f": {notes}" if notes else ""),
            )
        elif action == "warn":
            warning_message = notes or "You've received a warning from our moderation team. Please review our community guidelines."
            create_notification(
                user=warn_target,
                notif_type=Notification.TYPE_MODERATION_WARNING,
                payload={"report_id": report.pk, "message": warning_message},
            )
            from apps.messaging.utils import send_support_message
            send_support_message(warn_target, request.user, warning_message)
            AdminActionLog.objects.create(
                admin=request.user, action=AdminActionLog.ACTION_WARN_USER,
                target_user=warn_target,
                notes=f"Warned via fraud report #{report.pk}" + (f": {notes}" if notes else ""),
            )

        send_report_update_email.apply_async(
            args=[report.pk, decision, notes],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        create_notification(
            user=report.reporter,
            notif_type="report_update",
            payload={"report_id": report.pk, "decision": decision},
        )

        response = Response(FraudReportSerializer(report).data)
        self.finalize_idempotency(request, response)
        return response
