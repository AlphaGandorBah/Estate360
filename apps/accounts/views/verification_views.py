"""Landlord identity verification views."""
import uuid

import structlog
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import LandlordVerification
from apps.accounts.serializers import (
    LandlordVerificationSerializer,
    VerificationDecisionSerializer,
)
from apps.accounts.tasks import send_verification_result_task
from apps.common.clamav import scan_file
from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole, IsLandlord
from apps.common.storage import upload_file
from apps.common.throttles import ReadThrottle, UploadThrottle

logger = structlog.get_logger(__name__)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_SIZE = settings.VERIFICATION_DOC_MAX_SIZE_BYTES


def _upload_doc(file, prefix: str) -> str:
    if file.content_type not in ALLOWED_MIME_TYPES:
        from rest_framework.exceptions import ValidationError
        raise ValidationError(f"File type {file.content_type} not allowed. Use JPG, PNG, or PDF.")
    if file.size > MAX_SIZE:
        from rest_framework.exceptions import ValidationError
        raise ValidationError(f"File exceeds {MAX_SIZE // (1024 * 1024)} MB limit.")
    scan_file(file)
    key = f"verifications/{prefix}/{uuid.uuid4()}/{file.name}"
    file.seek(0)
    upload_file(key, file, content_type=file.content_type)
    return key


class LandlordVerificationSubmitView(IdempotencyMixin, APIView):
    permission_classes = [IsLandlord]
    parser_classes = [MultiPartParser]
    throttle_classes = [UploadThrottle]
    throttle_scope = "upload"

    def post(self, request: Request) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        if hasattr(request.user, "verification"):
            existing = request.user.verification
            if existing.status == LandlordVerification.STATUS_APPROVED:
                return Response(
                    {"code": "already_verified", "detail": "Already verified."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        doc_type = request.data.get("document_type")
        if doc_type not in dict(LandlordVerification.DOC_TYPE_CHOICES):
            return Response(
                {"code": "invalid_document_type", "detail": f"document_type must be one of {list(dict(LandlordVerification.DOC_TYPE_CHOICES).keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        front_file = request.FILES.get("document_front")
        back_file = request.FILES.get("document_back")
        selfie_file = request.FILES.get("selfie")

        if not front_file or not selfie_file:
            return Response(
                {"code": "missing_files", "detail": "document_front and selfie are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        front_key = _upload_doc(front_file, "front")
        back_key = _upload_doc(back_file, "back") if back_file else ""
        selfie_key = _upload_doc(selfie_file, "selfie")

        LandlordVerification.objects.filter(user=request.user).delete()
        verification = LandlordVerification.objects.create(
            user=request.user,
            document_type=doc_type,
            document_front_key=front_key,
            document_back_key=back_key,
            selfie_key=selfie_key,
        )

        response = Response(
            LandlordVerificationSerializer(verification).data,
            status=status.HTTP_201_CREATED,
        )
        self.finalize_idempotency(request, response)
        return response


class LandlordVerificationMeView(APIView):
    permission_classes = [IsLandlord]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        try:
            v = request.user.verification
        except LandlordVerification.DoesNotExist:
            return Response(
                {"code": "not_found", "detail": "No verification submitted."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LandlordVerificationSerializer(v).data)


class AdminVerificationListView(APIView):
    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request) -> Response:
        qs = LandlordVerification.objects.filter(
            status=LandlordVerification.STATUS_PENDING
        ).select_related("user").order_by("submitted_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(LandlordVerificationSerializer(page, many=True).data)


class AdminVerificationDecisionView(IdempotencyMixin, APIView):
    permission_classes = [IsAdminRole]

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        try:
            verification = LandlordVerification.objects.select_related("user").get(pk=pk)
        except LandlordVerification.DoesNotExist:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = VerificationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        notes = serializer.validated_data.get("notes", "")

        verification.status = decision
        verification.reviewed_by = request.user
        verification.reviewed_at = timezone.now()
        verification.notes = notes
        verification.save()

        if decision == LandlordVerification.STATUS_APPROVED:
            verification.user.is_verified = True
            verification.user.save(update_fields=["is_verified"])

        # Notify landlord via email async
        send_verification_result_task.apply_async(
            args=[str(verification.user_id), decision, notes],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        # In-app notification
        from apps.notifications.utils import create_notification
        create_notification(
            user=verification.user,
            notif_type="verification_result",
            payload={"decision": decision, "notes": notes},
        )

        response = Response(LandlordVerificationSerializer(verification).data)
        self.finalize_idempotency(request, response)
        return response
