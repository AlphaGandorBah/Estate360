"""ASGI config — serves both HTTP (DRF) and WebSocket (Channels)."""
import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

django_asgi_app = get_asgi_application()

# Import routing after Django setup
from apps.messaging.routing import websocket_urlpatterns as messaging_ws  # noqa: E402
from apps.notifications.routing import websocket_urlpatterns as notif_ws  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(messaging_ws + notif_ws))
        ),
    }
)
