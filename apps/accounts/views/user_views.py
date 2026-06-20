"""User profile views."""
import structlog
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import PublicUserSerializer, UserProfileSerializer
from apps.common.throttles import ReadThrottle

logger = structlog.get_logger(__name__)


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
