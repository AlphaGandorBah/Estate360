"""Root URL configuration."""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

_api_urlpatterns = [
    # ── Auth & Users ──────────────────────────────────────────────
    path("auth/", include("apps.accounts.urls.auth")),
    path("users/", include("apps.accounts.urls.users")),
    path("verification/", include("apps.accounts.urls.verification")),
    # ── Listings ──────────────────────────────────────────────────
    path("listings/", include("apps.listings.urls.listing_urls")),
    path("saved/", include("apps.listings.urls_saved")),
    path("panoramas/", include("apps.panoramas.urls")),
    # ── Discovery ─────────────────────────────────────────────────
    path("recommendations/", include("apps.recommendations.urls")),
    path("preferences/", include("apps.recommendations.urls_preferences")),
    # ── Engagement ────────────────────────────────────────────────
    path("conversations/", include("apps.messaging.urls")),
    path("chatbot/", include("apps.chatbot.urls")),
    path("notifications/", include("apps.notifications.urls")),
    # ── Moderation ────────────────────────────────────────────────
    path("reports/", include("apps.moderation.urls")),
    # ── Admin API ─────────────────────────────────────────────────
    path("admin/", include("apps.accounts.urls.admin_users")),
    path("admin/", include("apps.accounts.urls.admin_verification")),
    path("admin/", include("apps.listings.urls.admin_listing_urls")),
    path("admin/", include("apps.moderation.urls_admin")),
    # ── OpenAPI schema (raw JSON/YAML) ────────────────────────────
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    # ── Interactive docs ──────────────────────────────────────────
    path(
        "docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "docs/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(_api_urlpatterns)),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
