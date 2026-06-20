"""Celery task for the panorama processing pipeline."""
import structlog
from celery import shared_task

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.panoramas.tasks.process_panorama",
    queue="images",
    bind=True,
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    acks_late=True,
)
def process_panorama_task(self, panorama_id: int, tmp_s3_key: str, content_type: str, file_size: int) -> None:
    """
    Idempotent: if panorama is already 'ready', this is a no-op.
    Pulls the original file from tmp storage, runs the pipeline, removes the tmp object.
    """
    from .models import Panorama

    try:
        panorama = Panorama.objects.get(pk=panorama_id)
    except Panorama.DoesNotExist:
        logger.warning("process_panorama_not_found", panorama_id=panorama_id)
        return

    # Idempotency guard: if already done, skip
    if panorama.status == Panorama.STATUS_READY:
        logger.info("process_panorama_already_ready", panorama_id=panorama_id)
        return

    try:
        import io
        from apps.common.storage import get_s3_client
        from django.conf import settings

        client = get_s3_client()
        buf = io.BytesIO()
        client.download_fileobj(settings.MEDIA_S3_BUCKET, tmp_s3_key, buf)
        buf.seek(0)

        from .pipeline import process_panorama
        process_panorama(panorama_id, buf, content_type, file_size)

        # Clean up tmp upload
        from apps.common.storage import delete_file
        delete_file(tmp_s3_key)

    except Exception as exc:
        logger.exception("process_panorama_failed", panorama_id=panorama_id, error=str(exc))
        from .models import Panorama as P
        P.objects.filter(pk=panorama_id).update(
            status=P.STATUS_FAILED,
            failure_reason=str(exc),
        )
        raise self.retry(exc=exc)
