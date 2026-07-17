"""Same-origin delivery for public listing panorama assets."""
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.panoramas.models import Panorama

from .storage import get_s3_client


class PublicPanoramaMediaView(APIView):
    permission_classes = [AllowAny]

    def _panorama_for_key(self, request, key: str):
        if not key.startswith("panoramas/") or ".." in key.split("/"):
            raise Http404
        try:
            panorama_id = int(key.split("/", 2)[1])
            panorama = Panorama.objects.select_related("listing").get(
                pk=panorama_id, status=Panorama.STATUS_READY
            )
        except (ValueError, Panorama.DoesNotExist) as exc:
            raise Http404 from exc

        is_rendered_image = key in {panorama.thumbnail_key, panorama.preview_key}
        is_tile = bool(panorama.tiles_prefix) and key.startswith(f"{panorama.tiles_prefix}/")
        if not (is_rendered_image or is_tile):
            raise Http404

        user = request.user
        is_public = panorama.listing.status == "approved"
        may_manage = user.is_authenticated and (
            panorama.listing.owner_id == user.id or user.role == "admin"
        )
        if not (is_public or may_manage):
            raise Http404
        return panorama

    def get(self, request, key: str):
        self._panorama_for_key(request, key)
        params = {"Bucket": settings.MEDIA_S3_BUCKET, "Key": key}
        if request.headers.get("Range"):
            params["Range"] = request.headers["Range"]
        try:
            obj = get_s3_client().get_object(**params)
        except Exception as exc:
            # Do not reveal whether an unserved storage key exists.
            raise Http404 from exc

        response = FileResponse(
            obj["Body"],
            content_type=obj.get("ContentType", "application/octet-stream"),
            status=206 if obj.get("ContentRange") else 200,
        )
        response["Cache-Control"] = "public, max-age=3600"
        response["Accept-Ranges"] = "bytes"
        if obj.get("ContentLength") is not None:
            response["Content-Length"] = str(obj["ContentLength"])
        if obj.get("ContentRange"):
            response["Content-Range"] = obj["ContentRange"]
        if obj.get("ETag"):
            response["ETag"] = obj["ETag"]
        return response

    def head(self, request, key: str):
        self._panorama_for_key(request, key)
        try:
            obj = get_s3_client().head_object(
                Bucket=settings.MEDIA_S3_BUCKET,
                Key=key,
            )
        except Exception as exc:
            raise Http404 from exc
        response = HttpResponse(content_type=obj.get("ContentType", "application/octet-stream"))
        response["Cache-Control"] = "public, max-age=3600"
        response["Accept-Ranges"] = "bytes"
        if obj.get("ContentLength") is not None:
            response["Content-Length"] = str(obj["ContentLength"])
        return response
