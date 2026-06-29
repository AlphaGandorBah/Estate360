"""Development settings."""
from decouple import config

from .base import *  # noqa: F401, F403

DEBUG = True

# Use in-process cache so Redis is not required locally
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

try:
    import debug_toolbar  # noqa: F401
    INSTALLED_APPS += ["debug_toolbar"]  # noqa: F405
    MIDDLEWARE += ["debug_toolbar.middleware.DebugToolbarMiddleware"]  # noqa: F405
except ImportError:
    pass

INTERNAL_IPS = ["127.0.0.1"]

# Dev defaults to the smtp backend (overridable via EMAIL_BACKEND) pointed at
# a local `maildev` catcher (`npm i -g maildev && maildev`), viewable at
# http://localhost:1080. EMAIL_HOST defaults to localhost for running Django
# directly on the host; docker-compose.yml overrides it to
# host.docker.internal for the containerized web/worker services so they can
# reach the catcher running on the host machine.
EMAIL_BACKEND = config(
    "EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = config("EMAIL_HOST", default="localhost")
EMAIL_PORT = config("EMAIL_PORT", cast=int, default=1025)
EMAIL_HOST_USER = ""
EMAIL_HOST_PASSWORD = ""
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False

DEFAULT_FROM_EMAIL = "noreply@estate360.local"

# Looser password validation in dev
AUTH_PASSWORD_VALIDATORS = []

import structlog  # noqa: E402

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
