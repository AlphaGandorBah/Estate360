"""Shared helper for notifying the other side of a conversation about a new
message — used by both the REST send path and the WS consumer so the two
stay in sync.
"""
import structlog
from apps.accounts.models import User

logger = structlog.get_logger(__name__)


def send_support_message(user, sender, body: str):
    """Posts a message into `user`'s support inbox from `sender` (e.g. an
    admin issuing a moderation warning) so the recipient has something
    concrete to read in Messages, not just a notification badge.
    """
    from django.utils import timezone
    from .models import Conversation, Message

    conv, _ = Conversation.objects.get_or_create(initiator=user, is_support=True)
    msg = Message.objects.create(conversation=conv, sender=sender, body=body)
    conv.last_message_at = timezone.now()
    conv.save(update_fields=["last_message_at"])

    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    if channel_layer:
        try:
            async_to_sync(channel_layer.group_send)(
                f"conversation_{conv.id}",
                {
                    "type": "chat_message",
                    "payload": {
                        "type": "message.new",
                        "id": msg.id,
                        "sender_id": str(sender.id),
                        "body": msg.body,
                        "created_at": msg.created_at.isoformat(),
                        "client_key": None,
                    },
                },
            )
        except Exception as exc:
            logger.warning("ws_broadcast_failed", error=str(exc), conversation_id=conv.id)

    notify_new_message(conv, sender)
    return msg


def notify_new_message(conversation, sender) -> None:
    from apps.notifications.models import Notification
    from apps.notifications.utils import create_notification

    if conversation.is_support:
        if sender.role == User.ROLE_ADMIN:
            recipients = [conversation.initiator]
        else:
            recipients = list(User.objects.filter(role=User.ROLE_ADMIN))
    else:
        other = conversation.landlord if sender.pk == conversation.initiator_id else conversation.initiator
        recipients = [other]

    for recipient in recipients:
        create_notification(
            user=recipient,
            notif_type=Notification.TYPE_NEW_MESSAGE,
            payload={"conversation_id": conversation.id},
        )
