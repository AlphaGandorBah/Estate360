"""Panorama views."""
import uuid

import structlog
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.idempotency import IdempotencyMixin
from apps.common.pagination import StandardPagination
from apps.common.permissions import IsOwnerOrReadOnly
from apps.common.storage import upload_file
from apps.common.throttles import ReadThrottle, UploadThrottle

from .models import Panorama
from .serializers import PanoramaSerializer
from .tasks import process_panorama_task

logger = structlog.get_logger(__name__)


class PanoramaListCreateView(IdempotencyMixin, APIView):
    """GET /listings/{id}/panoramas   POST /listings/{id}/panoramas"""

    parser_classes = [MultiPartParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return [UploadThrottle()]

    def _get_listing(self, pk: int):
        from apps.listings.models import Listing
        try:
            return Listing.objects.get(pk=pk)
        except Listing.DoesNotExist:
            return None

    def get(self, request: Request, pk: int) -> Response:
        listing = self._get_listing(pk)
        if not listing:
            return Response({"code": "not_found", "detail": "Listing not found."}, status=status.HTTP_404_NOT_FOUND)
        panoramas = listing.panoramas.all()
        paginator = StandardPagination()
        page = paginator.paginate_queryset(panoramas, request)
        return paginator.get_paginated_response(PanoramaSerializer(page, many=True).data)

    def post(self, request: Request, pk: int) -> Response:
        short_circuit = self.enforce_idempotency(request)
        if short_circuit is not None:
            return short_circuit

        listing = self._get_listing(pk)
        if not listing:
            return Response({"code": "not_found", "detail": "Listing not found."}, status=status.HTTP_404_NOT_FOUND)

        if listing.owner != request.user:
            return Response({"code": "forbidden", "detail": "Not your listing."}, status=status.HTTP_403_FORBIDDEN)

        image_file = request.FILES.get("image")
        room_label = request.data.get("room_label", "")
        try:
            ordering = int(request.data.get("ordering", 0))
        except (TypeError, ValueError):
            ordering = 0

        if not image_file:
            return Response({"code": "missing_file", "detail": "image file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not room_label:
            return Response({"code": "missing_label", "detail": "room_label is required."}, status=status.HTTP_400_BAD_REQUEST)
        if image_file.content_type not in {"image/jpeg", "image/png"}:
            return Response({"code": "invalid_type", "detail": "Only JPEG and PNG images are accepted."}, status=status.HTTP_400_BAD_REQUEST)

        # Store the upload in a tmp S3 key for the worker to consume
        tmp_key = f"panoramas/tmp/{uuid.uuid4()}/{image_file.name}"
        image_file.seek(0)
        upload_file(tmp_key, image_file, content_type=image_file.content_type)

        # Create Panorama record
        panorama = Panorama.objects.create(
            listing=listing,
            room_label=room_label,
            ordering=ordering,
            status=Panorama.STATUS_PENDING,
        )

        # Dispatch processing task
        process_panorama_task.apply_async(
            args=[panorama.pk, tmp_key, image_file.content_type, image_file.size],
            headers={"request_id": getattr(request, "request_id", "-")},
        )

        response = Response(PanoramaSerializer(panorama).data, status=status.HTTP_202_ACCEPTED)
        self.finalize_idempotency(request, response)
        return response


class PanoramaDetailView(APIView):
    """GET /panoramas/{id}   DELETE /panoramas/{id}"""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_throttles(self):
        if self.request.method == "GET":
            return [ReadThrottle()]
        return super().get_throttles()

    def _get_panorama(self, pk: int):
        try:
            return Panorama.objects.select_related("listing__owner").get(pk=pk)
        except Panorama.DoesNotExist:
            return None

    def get(self, request: Request, pk: int) -> Response:
        panorama = self._get_panorama(pk)
        if not panorama:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(PanoramaSerializer(panorama).data)

    def delete(self, request: Request, pk: int) -> Response:
        panorama = self._get_panorama(pk)
        if not panorama:
            return Response({"code": "not_found", "detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if panorama.listing.owner != request.user:
            return Response({"code": "forbidden", "detail": "Not your panorama."}, status=status.HTTP_403_FORBIDDEN)
        panorama.delete()  # signal handles storage cleanup
        return Response(status=status.HTTP_204_NO_CONTENT)
