from django.contrib import admin
from .models import Panorama


@admin.register(Panorama)
class PanoramaAdmin(admin.ModelAdmin):
    list_display = ["id", "listing", "room_label", "status", "projection", "ordering", "created_at"]
    list_filter = ["status", "projection"]
    search_fields = ["listing__title", "room_label"]
    readonly_fields = ["tiles_prefix", "original_key", "thumbnail_key", "preview_key"]
