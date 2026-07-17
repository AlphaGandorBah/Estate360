"""Panorama serializers."""
from rest_framework import serializers

from .models import Panorama


class PanoramaSerializer(serializers.ModelSerializer):
    tile_url = serializers.SerializerMethodField()
    preview_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Panorama
        fields = [
            "id",
            "listing_id",
            "room_label",
            "projection",
            "width",
            "height",
            "status",
            "failure_reason",
            "ordering",
            "tile_url",
            "preview_url",
            "thumbnail_url",
            "created_at",
        ]

    def _presign(self, key: str):
        if not key:
            return None
        from apps.common.storage import public_media_url
        return public_media_url(key)

    def get_tile_url(self, obj) -> str | None:
        # Return presigned URL to tiles/config.json
        if obj.tiles_prefix:
            return self._presign(f"{obj.tiles_prefix}/config.json")
        return None

    def get_preview_url(self, obj) -> str | None:
        return self._presign(obj.preview_key)

    def get_thumbnail_url(self, obj) -> str | None:
        return self._presign(obj.thumbnail_key)
