"""Test settings."""
import os

from .base import *  # noqa: F401, F403

DEBUG = False

# Use SQLite in-memory locally unless DATABASE_URL is explicitly provided (e.g., CI with Postgres)
if not os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Use in-memory channel layer for tests
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

# Use in-memory cache for tests (no Redis required)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Fast Celery execution in tests (synchronous)
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Skip ClamAV in tests
CLAMAV_HOST = None

# No coverage penalty for missing OTP in tests
OTP_TTL_SECONDS = 600
