"""Helper to create a Notification and push it over the WS channel layer."""
import structlog
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = structlog.get_logger(__name__)


def create_notification(user, notif_type: str, payload: dict) -> "Notification":
    from .models import Notification

    notif = Notification.objects.create(user=user, type=notif_type, payload=payload)

    # Push over WS
    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                f"notifications_{user.pk}",
                {
                    "type": "notification_push",
                    "payload": {
                        "type": "notification.new",
                        "notification_id": notif.id,
                        "kind": notif_type,
                        "payload": payload,
                    },
                },
            )
            notif.is_sent = True
            notif.save(update_fields=["is_sent"])
    except Exception as exc:
        logger.warning("notification_ws_push_failed", error=str(exc), notification_id=notif.id)

    return notif
