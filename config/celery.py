"""Celery application factory."""
import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("estate360")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# ─── Celery Beat schedule ─────────────────────────────────────────────────────
app.conf.beat_schedule = {
    # Nightly recommender rebuild at 02:00 UTC
    "recommender-nightly-rebuild": {
        "task": "apps.recommendations.tasks.rebuild_recommender_model",
        "schedule": crontab(hour=2, minute=0),
    },
    # Purge expired idempotency keys hourly
    "purge-expired-idempotency-keys": {
        "task": "apps.common.tasks.purge_expired_idempotency_keys",
        "schedule": crontab(minute=0),
    },
    # Expire stale listings daily at 03:00 UTC
    "expire-stale-listings": {
        "task": "apps.listings.tasks.expire_stale_listings",
        "schedule": crontab(hour=3, minute=0),
    },
    # Age out old interaction logs daily at 04:00 UTC
    "purge-old-interactions": {
        "task": "apps.recommendations.tasks.purge_old_interactions",
        "schedule": crontab(hour=4, minute=0),
    },
    # Reload chatbot index daily at 01:00 UTC
    "chatbot-reload-index": {
        "task": "apps.chatbot.tasks.reload_index",
        "schedule": crontab(hour=1, minute=0),
    },
}
