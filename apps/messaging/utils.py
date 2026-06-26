"""Shared helper for notifying the other side of a conversation about a new
message — used by both the REST send path and the WS consumer so the two
stay in sync.
"""
from apps.accounts.models import User


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
