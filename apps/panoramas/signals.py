"""Post-delete signal: enqueue object-storage cleanup when a Panorama is deleted."""
import structlog
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Panorama

logger = structlog.get_logger(__name__)


@receiver(post_delete, sender=Panorama)
def cleanup_panorama_storage(sender, instance: Panorama, **kwargs):
    from apps.common.tasks import _delete_panorama_storage  # noqa: PLC0415
    _delete_panorama_storage.apply_async(
        args=[
            instance.original_key or "",
            instance.tiles_prefix or "",
            instance.thumbnail_key or "",
            instance.preview_key or "",
        ]
    )
    logger.info("panorama_storage_cleanup_queued", panorama_id=instance.pk)
