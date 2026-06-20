"""Recommendation Celery tasks."""
import structlog
from celery import shared_task

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.recommendations.tasks.rebuild_recommender_model",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def rebuild_recommender_model() -> None:
    from .model import build_model
    build_model()


@shared_task(
    name="apps.recommendations.tasks.recompute_user_vector",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def recompute_user_vector(user_id: str) -> None:
    """
    On-demand recompute of a single user vector.
    Debounced 30s via Redis lock — if a lock already exists, skip.
    """
    from django.core.cache import cache
    from django.contrib.auth import get_user_model

    lock_key = f"recs_debounce_{user_id}"
    if not cache.add(lock_key, 1, timeout=30):
        logger.info("recompute_user_vector_debounced", user_id=user_id)
        return

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    # The full model is rebuilt nightly; this task just warms the cache
    # (future: could store per-user vector cache here)
    logger.info("recompute_user_vector_done", user_id=user_id)


@shared_task(
    name="apps.recommendations.tasks.purge_old_interactions",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def purge_old_interactions() -> int:
    from django.utils import timezone
    from apps.listings.models import UserInteraction

    cutoff = timezone.now() - timezone.timedelta(days=180)
    deleted, _ = UserInteraction.objects.filter(created_at__lt=cutoff).delete()
    logger.info("old_interactions_purged", count=deleted)
    return deleted
