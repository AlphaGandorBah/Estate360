"""Base settings shared across all environments."""
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("SECRET_KEY")
ALLOWED_HOSTS = config("ALLOWED_HOSTS", cast=Csv(), default="localhost,127.0.0.1")

# Django only treats X-Forwarded-* headers as authoritative when the deployment
# explicitly opts in.  The bundled HTTPS reverse proxy sets these headers, but
# a directly exposed development server must not trust values supplied by an
# arbitrary client.
TRUST_PROXY_HEADERS = config("TRUST_PROXY_HEADERS", cast=bool, default=False)
if TRUST_PROXY_HEADERS:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = True

DJANGO_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",
    "django_celery_beat",
    "django_celery_results",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.common",
    "apps.listings",
    "apps.panoramas",
    "apps.messaging",
    "apps.notifications",
    "apps.chatbot",
    "apps.recommendations",
    "apps.moderation",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "config.middleware.RequestIDMiddleware",
    "config.middleware.StructlogMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database
import dj_database_url  # noqa: E402 - imported after path setup

DATABASES = {
    "default": dj_database_url.config(
        default=config("DATABASE_URL", default="postgres://estate360:estate360@localhost:5432/estate360"),
        conn_max_age=600,
    )
}

# Custom User model
AUTH_USER_MODEL = "accounts.User"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="redis://localhost:6379")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"{REDIS_URL}/1",
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        "KEY_PREFIX": "estate360",
    }
}

# ─── Channels ─────────────────────────────────────────────────────────────────
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [f"{REDIS_URL}/2"]},
    }
}

# ─── Celery ───────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = f"{REDIS_URL}/3"
CELERY_RESULT_BACKEND = f"{REDIS_URL}/4"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ROUTES = {
    "apps.panoramas.tasks.*": {"queue": "images"},
    "apps.accounts.tasks.*": {"queue": "email"},
    "apps.listings.tasks.*": {"queue": "email"},
    "apps.moderation.tasks.*": {"queue": "email"},
}
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# ─── DRF ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "240/min",
        "auth": "10/min",
        "chatbot": "20/min",
        "messaging": "60/min",
        "upload": "20/hour",
        "read": "600/min",
    },
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.custom_exception_handler",
}

# ─── JWT ──────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": config("JWT_SIGNING_KEY", default=SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Refresh cookie settings
JWT_REFRESH_COOKIE_NAME = "refresh"
JWT_REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days
# Local HTTPS can run with Django's DEBUG setting enabled, so cookie security
# must follow the transport configuration instead of DEBUG alone.
JWT_REFRESH_COOKIE_SECURE = config(
    "JWT_REFRESH_COOKIE_SECURE", cast=bool, default=False
)

# ─── drf-spectacular ──────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Estate360 API",
    "DESCRIPTION": "Real estate marketplace for Freetown, Sierra Leone.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1/",
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": ["drf_spectacular.hooks.postprocess_schema_enums"],
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    cast=Csv(),
    default="http://localhost:5173,https://localhost",
)
CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ["X-Request-ID"]

# ─── CSRF ─────────────────────────────────────────────────────────────────────
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    cast=Csv(),
    default=(
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://localhost"
    ),
)

# ─── S3 / Object Storage ──────────────────────────────────────────────────────
MEDIA_S3_ENDPOINT = config("MEDIA_S3_ENDPOINT", default="http://localhost:9000")
MEDIA_S3_ACCESS_KEY = config("MEDIA_S3_ACCESS_KEY", default="minioadmin")
MEDIA_S3_SECRET_KEY = config("MEDIA_S3_SECRET_KEY", default="minioadmin")
MEDIA_S3_BUCKET = config("MEDIA_S3_BUCKET", default="estate360")
MEDIA_S3_REGION = config("MEDIA_S3_REGION", default="us-east-1")
# Browser-reachable endpoint used when signing media URLs. This may differ
# from MEDIA_S3_ENDPOINT when the app talks to MinIO over a Docker hostname.
MEDIA_HOST = config("MEDIA_HOST", default=MEDIA_S3_ENDPOINT)

# Presigned URL expiry (seconds)
PRESIGNED_URL_EXPIRY = 86400  # 24 hours

# ─── Email ────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_FROM = config("EMAIL_FROM", default="no-reply@estate360.local")

# ─── ClamAV ───────────────────────────────────────────────────────────────────
CLAMAV_HOST = config("CLAMAV_HOST", default="localhost")
CLAMAV_PORT = config("CLAMAV_PORT", cast=int, default=3310)

# ─── OTP settings ─────────────────────────────────────────────────────────────
OTP_LENGTH = 6
OTP_TTL_SECONDS = 600  # 10 minutes
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN = 60  # seconds

# ─── Idempotency ──────────────────────────────────────────────────────────────
IDEMPOTENCY_KEY_TTL_SECONDS = 86400  # 24 hours

# IdempotencyMixin hashes request.body for any POST carrying an Idempotency-Key
# header (the frontend attaches one to every /listings/... write, which covers
# panorama and verification uploads). Accessing request.body reads the whole
# multipart payload — file bytes included — into memory, so the cap here must
# clear the largest multipart body those endpoints accept (a 25 MB panorama,
# or three 8 MB verification documents in one request) or every real-world
# upload trips Django's RequestDataTooBig before the view's own size checks
# ever run.
DATA_UPLOAD_MAX_MEMORY_SIZE = 55 * 1024 * 1024  # 55 MB — headroom above the 50 MB panorama limit

# ─── Panorama ─────────────────────────────────────────────────────────────────
PANORAMA_MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB — high-res phone panoramas can exceed 25 MB
PANORAMA_MIN_WIDTH = 1500               # floor for any recognisable panorama; phones easily exceed this
PANORAMA_MIN_ASPECT_RATIO = 1.9         # reject ordinary 4:3 and 16:9 flat photos
PANORAMA_MAX_LONG_EDGE = 15000          # raised for pro-app / DSLR stitched panoramas
PANORAMA_ORIGINAL_RETENTION_DAYS = 30

# ─── Verification docs ────────────────────────────────────────────────────────
VERIFICATION_DOC_MAX_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB

# ─── Avatars ──────────────────────────────────────────────────────────────────
AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

# ─── Listing housekeeping ─────────────────────────────────────────────────────
LISTING_STALE_DAYS = 90

# ─── Recommender ──────────────────────────────────────────────────────────────
RECOMMENDER_MODEL_DIR = MEDIA_ROOT / "recommender"
RECOMMENDER_TOP_N = 20
RECOMMENDER_EXCLUDE_VIEWED_DAYS = 7
RECOMMENDER_MAX_INTERACTIONS = 50
RECOMMENDER_DEBOUNCE_SECONDS = 30
