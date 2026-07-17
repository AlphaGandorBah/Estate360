"""User profile views."""
import uuid

import structlog
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AccountDeletionRequest, User
from apps.accounts.serializers import AccountDeletionRequestSerializer, PublicUserSerializer, UserProfileSerializer
from apps.common.clamav import scan_file
from apps.common.storage import delete_file, upload_file
from apps.common.throttles import ReadThrottle, UploadThrottle

logger = structlog.get_logger(__name__)

ALLOWED_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request: Request) -> Response:
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request: Request) -> Response:
        return Response(
            {
                "code": "deletion_not_allowed",
                "detail": "Direct account deletion is disabled. Submit a deletion request via POST /users/me/request-deletion.",
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class AvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]
    throttle_classes = [UploadThrottle]
    throttle_scope = "upload"

    def post(self, request: Request) -> Response:
        avatar_file = request.FILES.get("avatar")
        if not avatar_file:
            return Response({"code": "missing_file", "detail": "avatar file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if avatar_file.content_type not in ALLOWED_AVATAR_MIME_TYPES:
            raise ValidationError("File type not allowed. Use JPG, PNG, or WEBP.")
        if avatar_file.size > settings.AVATAR_MAX_SIZE_BYTES:
            raise ValidationError(f"File exceeds {settings.AVATAR_MAX_SIZE_BYTES // (1024 * 1024)} MB limit.")

        scan_file(avatar_file)

        user: User = request.user
        old_key = user.avatar_key

        key = f"avatars/{user.id}/{uuid.uuid4()}/{avatar_file.name}"
        avatar_file.seek(0)
        upload_file(key, avatar_file, content_type=avatar_file.content_type)

        user.avatar_key = key
        user.save(update_fields=["avatar_key"])

        if old_key:
            delete_file(old_key)

        return Response(UserProfileSerializer(user).data)

    def delete(self, request: Request) -> Response:
        user: User = request.user
        if user.avatar_key:
            delete_file(user.avatar_key)
            user.avatar_key = ""
            user.save(update_fields=["avatar_key"])
        return Response(UserProfileSerializer(user).data)


class PublicUserView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ReadThrottle]
    throttle_scope = "read"

    def get(self, request: Request, pk: str) -> Response:
        try:
            user = User.objects.get(pk=pk, is_active=True, deleted_at__isnull=True)
        except User.DoesNotExist:
            return Response({"code": "not_found", "detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PublicUserSerializer(user)
        return Response(serializer.data)


class RequestDeletionView(APIView):
    """POST /users/me/request-deletion — submit a deletion request for admin approval."""
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user: User = request.user
        pending = AccountDeletionRequest.objects.filter(
            user=user, status=AccountDeletionRequest.STATUS_PENDING
        ).exists()
        if pending:
            return Response(
                {"code": "request_exists", "detail": "You already have a pending deletion request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get("reason", "")
        req = AccountDeletionRequest.objects.create(user=user, reason=reason)
        return Response(
            AccountDeletionRequestSerializer(req).data,
            status=status.HTTP_201_CREATED,
        )

    def get(self, request: Request) -> Response:
        """GET /users/me/request-deletion — check if a pending request exists."""
        req = AccountDeletionRequest.objects.filter(
            user=request.user
        ).order_by("-requested_at").first()
        if not req:
            return Response({"code": "not_found", "detail": "No deletion request found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AccountDeletionRequestSerializer(req).data)
