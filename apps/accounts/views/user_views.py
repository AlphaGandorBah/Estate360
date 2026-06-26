"""User profile views."""
import uuid

import structlog
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import PublicUserSerializer, UserProfileSerializer
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
        user: User = request.user
        # Hard-delete draft listings
        user.listings.filter(status="draft").delete()
        # Archive approved/pending listings
        user.listings.filter(status__in=["approved", "pending"]).update(status="archived")
        # Soft-delete the user
        user.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
