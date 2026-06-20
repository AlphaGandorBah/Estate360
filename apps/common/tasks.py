"""Common Celery tasks."""
from celery import shared_task
from django.utils import timezone
import structlog

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.common.tasks.purge_expired_idempotency_keys",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def purge_expired_idempotency_keys() -> int:
    from .models import IdempotencyKey

    deleted, _ = IdempotencyKey.objects.filter(expires_at__lt=timezone.now()).delete()
    logger.info("idempotency_keys_purged", count=deleted)
    return deleted


@shared_task(
    name="apps.common.tasks._delete_panorama_storage",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def _delete_panorama_storage(
    original_key: str,
    tiles_prefix: str,
    thumbnail_key: str,
    preview_key: str,
) -> None:
    """Remove all object-storage objects for a deleted panorama."""
    from .storage import delete_file, get_s3_client
    from django.conf import settings

    for key in [original_key, thumbnail_key, preview_key]:
        if key:
            delete_file(key)

    if tiles_prefix:
        client = get_s3_client()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.MEDIA_S3_BUCKET, Prefix=tiles_prefix):
            for obj in page.get("Contents", []):
                delete_file(obj["Key"])

    logger.info("panorama_storage_cleaned", prefix=tiles_prefix)
