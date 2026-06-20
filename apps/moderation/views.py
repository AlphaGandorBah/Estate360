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

    def get(self, request: Request) -> Response:
        qs = FraudReport.objects.filter(
            status__in=[FraudReport.STATUS_OPEN, FraudReport.STATUS_REVIEWING]
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
        notes = serializer.validated_data.get("notes", "")

        report.status = decision
        report.handled_by = request.user
        report.resolved_at = timezone.now()
        report.resolution_notes = notes
        report.save()

        send_report_update_email.apply_async(
            args=[report.pk, decision, notes],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        from apps.notifications.utils import create_notification
        create_notification(
            user=report.reporter,
            notif_type="report_update",
            payload={"report_id": report.pk, "decision": decision},
        )

        response = Response(FraudReportSerializer(report).data)
        self.finalize_idempotency(request, response)
        return response
