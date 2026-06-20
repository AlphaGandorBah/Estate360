"""Listing-related Celery tasks."""
import structlog
from celery import shared_task
from django.conf import settings
from django.utils import timezone

try:
    from django.contrib.postgres.search import SearchVector
except ImportError:
    SearchVector = None  # type: ignore[assignment,misc]

logger = structlog.get_logger(__name__)


@shared_task(
    name="apps.listings.tasks.expire_stale_listings",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def expire_stale_listings() -> int:
    from .models import Listing, ListingStatus

    cutoff = timezone.now() - timezone.timedelta(days=settings.LISTING_STALE_DAYS)
    updated = Listing.objects.filter(
        status=ListingStatus.APPROVED,
        updated_at__lt=cutoff,
    ).update(status=ListingStatus.EXPIRED)
    logger.info("stale_listings_expired", count=updated)
    return updated


@shared_task(
    name="apps.listings.tasks.update_search_vector",
    queue="default",
    max_retries=3,
    retry_backoff=True,
)
def update_search_vector(listing_id: int) -> None:
    from django.db import connection
    from .models import Listing

    # SearchVector requires PostgreSQL — skip silently on other backends (e.g. SQLite in tests)
    if connection.vendor != "postgresql":
        return

    try:
        Listing.objects.filter(pk=listing_id).update(
            search_vector=SearchVector("title", weight="A") + SearchVector("description", weight="B")
        )
        logger.info("search_vector_updated", listing_id=listing_id)
    except Exception as exc:
        logger.warning("search_vector_update_failed", listing_id=listing_id, error=str(exc))


@shared_task(
    name="apps.listings.tasks.send_listing_decision_email",
    queue="email",
    max_retries=5,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def send_listing_decision_email(listing_id: int, decision: str, notes: str) -> None:
    from django.core.mail import send_mail
    from .models import Listing

    try:
        listing = Listing.objects.select_related("owner").get(pk=listing_id)
    except Listing.DoesNotExist:
        return

    subject = f"Estate360 — Listing '{listing.title}' {decision}"
    body = (
        f"Hi {listing.owner.full_name},\n\n"
        f"Your listing '{listing.title}' has been {decision}.\n"
        f"{'Notes: ' + notes if notes else ''}\n\n"
        "Estate360 Team"
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.EMAIL_FROM,
        recipient_list=[listing.owner.email],
        fail_silently=True,
    )
