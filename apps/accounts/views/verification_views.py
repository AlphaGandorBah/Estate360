"""Identity verification views for tenants and property providers."""
import uuid

import structlog
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import LandlordVerification, User
from apps.accounts.serializers import (
    LandlordVerificationSerializer,
    VerificationDecisionSerializer,
)
from apps.accounts.tasks import send_verification_result_task
from apps.common.clamav import scan_file
from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsAdminRole, IsTenantOrPropertyProvider
from apps.common.storage import ObjectStorageUnavailableError, delete_file, upload_file
from apps.common.throttles import ReadThrottle, UploadThrottle

logger = structlog.get_logger(__name__)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_SIZE = settings.VERIFICATION_DOC_MAX_SIZE_BYTES


class VerificationStorageUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Document storage is temporarily unavailable. Please try again."
    default_code = "storage_unavailable"


class InvalidVerificationFile(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The verification file is invalid."
    default_code = "invalid_verification_file"


class _AlreadyVerifiedDuringSubmissionError(Exception):
    """Internal signal used when a concurrent approval wins the race."""


def _detect_content_type(file, *, allow_pdf: bool) -> str:
    """Detect supported document types from bytes instead of browser headers."""
    file.seek(0)
    header = file.read(16)
    file.seek(0)

    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.lstrip().startswith(b"%PDF-"):
        return "application/pdf"

    formats = "JPG or PNG" if not allow_pdf else "JPG, PNG, or PDF"
    raise InvalidVerificationFile(
        f"Unsupported or invalid file. Use a valid {formats} file."
    )


def _prepare_doc(file, *, allow_pdf: bool = True) -> str:
    if file.size > MAX_SIZE:
        raise InvalidVerificationFile(
            f"File exceeds the {MAX_SIZE // (1024 * 1024)} MB limit."
        )

    content_type = _detect_content_type(file, allow_pdf=allow_pdf)
    if content_type not in ALLOWED_MIME_TYPES or (
        content_type == "application/pdf" and not allow_pdf
    ):
        raise InvalidVerificationFile("The selfie must be a valid JPG or PNG image.")

    scan_file(file)
    file.seek(0)
    return content_type


def _upload_doc(file, prefix: str, content_type: str) -> str:
    key = f"verifications/{prefix}/{uuid.uuid4()}/{file.name}"
    file.seek(0)
    upload_file(key, file, content_type=content_type)
    return key


def _cleanup_docs(keys: list[str]) -> None:
    """Best-effort cleanup for replaced or partially uploaded documents."""
    for key in keys:
        if not key:
            continue
        try:
            delete_file(key)
        except Exception as exc:  # cleanup must not hide the original result
            logger.warning("verification_document_cleanup_failed", key=key, error=str(exc))


class LandlordVerificationSubmitView(IdempotencyMixin, APIView):
    permission_classes = [IsTenantOrPropertyProvider]
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

        # Validate and antivirus-scan every file before writing any of them.
        # Previously, a bad back image or selfie could leave the already
        # uploaded front image orphaned in the bucket.
        prepared = [
            (front_file, "front", _prepare_doc(front_file)),
            (selfie_file, "selfie", _prepare_doc(selfie_file, allow_pdf=False)),
        ]
        if back_file:
            prepared.insert(1, (back_file, "back", _prepare_doc(back_file)))

        uploaded_keys: list[str] = []
        keys_by_prefix: dict[str, str] = {}
        try:
            for file, prefix, content_type in prepared:
                key = _upload_doc(file, prefix, content_type)
                uploaded_keys.append(key)
                keys_by_prefix[prefix] = key
        except ObjectStorageUnavailableError as exc:
            _cleanup_docs(uploaded_keys)
            raise VerificationStorageUnavailable() from exc
        except Exception:
            _cleanup_docs(uploaded_keys)
            raise

        front_key = keys_by_prefix["front"]
        back_key = keys_by_prefix.get("back", "")
        selfie_key = keys_by_prefix["selfie"]

        old_keys: list[str] = []
        try:
            with transaction.atomic():
                # Locking the user serializes first submissions as well as
                # resubmissions; a OneToOne row alone cannot be locked before
                # it exists.
                user = User.objects.select_for_update().get(pk=request.user.pk)
                existing = (
                    LandlordVerification.objects.select_for_update()
                    .filter(user=user)
                    .first()
                )
                if existing and existing.status == LandlordVerification.STATUS_APPROVED:
                    raise _AlreadyVerifiedDuringSubmissionError

                if existing:
                    old_keys = [
                        existing.document_front_key,
                        existing.document_back_key,
                        existing.selfie_key,
                    ]
                    existing.document_type = doc_type
                    existing.document_front_key = front_key
                    existing.document_back_key = back_key
                    existing.selfie_key = selfie_key
                    existing.status = LandlordVerification.STATUS_PENDING
                    existing.reviewed_by = None
                    existing.reviewed_at = None
                    existing.notes = ""
                    existing.submitted_at = timezone.now()
                    existing.save()
                    verification = existing
                else:
                    verification = LandlordVerification.objects.create(
                        user=user,
                        document_type=doc_type,
                        document_front_key=front_key,
                        document_back_key=back_key,
                        selfie_key=selfie_key,
                    )
        except _AlreadyVerifiedDuringSubmissionError:
            _cleanup_docs(uploaded_keys)
            return Response(
                {"code": "already_verified", "detail": "Already verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            _cleanup_docs(uploaded_keys)
            raise

        # Delete the superseded files only after the database commit.  If a
        # replacement fails, the user's previous review remains intact.
        _cleanup_docs(old_keys)

        response = Response(
            LandlordVerificationSerializer(verification).data,
            status=status.HTTP_201_CREATED,
        )
        self.finalize_idempotency(request, response)
        return response


class LandlordVerificationMeView(APIView):
    permission_classes = [IsTenantOrPropertyProvider]
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
        status_param = request.GET.get("status", LandlordVerification.STATUS_PENDING)
        if status_param not in dict(LandlordVerification.STATUS_CHOICES):
            return Response(
                {"code": "invalid_status", "detail": f"status must be one of {[c[0] for c in LandlordVerification.STATUS_CHOICES]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = LandlordVerification.objects.filter(
            status=status_param
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

        serializer = VerificationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        notes = serializer.validated_data.get("notes", "")

        with transaction.atomic():
            try:
                verification = (
                    LandlordVerification.objects.select_for_update()
                    .select_related("user")
                    .get(pk=pk)
                )
            except LandlordVerification.DoesNotExist:
                return Response(
                    {"code": "not_found", "detail": "Not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if verification.status != LandlordVerification.STATUS_PENDING:
                return Response(
                    {
                        "code": "already_decided",
                        "detail": "This verification has already been reviewed.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            verification.status = decision
            verification.reviewed_by = request.user
            verification.reviewed_at = timezone.now()
            verification.notes = notes
            verification.save()

            # A rejection must revoke any stale verification flag just as an
            # approval grants it. This keeps listing permissions aligned with
            # the authoritative verification decision.
            verification.user.is_verified = (
                decision == LandlordVerification.STATUS_APPROVED
            )
            verification.user.save(update_fields=["is_verified"])

        # Notify the applicant via email asynchronously.
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


class AdminUserVerificationView(APIView):
    """GET /admin/users/{user_pk}/verification — view any user's verification documents."""
    permission_classes = [IsAdminRole]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request, user_pk: str) -> Response:
        try:
            verification = LandlordVerification.objects.select_related("user").get(user_id=user_pk)
        except LandlordVerification.DoesNotExist:
            return Response(
                {"code": "not_found", "detail": "No verification found for this user."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LandlordVerificationSerializer(verification).data)
