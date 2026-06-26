"""Conversation and Message models."""
import uuid

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    # The tenant or landlord who started the thread. For a landlord
    # conversation this is always the tenant (only tenants can start those);
    # for a support conversation it's whichever of the two reached out.
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_conversations",
    )
    # Null for support conversations, which aren't tied to one specific
    # admin — any admin can see and reply to them (a shared inbox).
    landlord = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="landlord_conversations",
    )
    listing = models.ForeignKey(
        "listings.Listing",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="conversations",
    )
    is_support = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("initiator", "landlord", "listing")]
        constraints = [
            # One shared support thread per initiator — get_or_create relies
            # on this to stay idempotent under concurrent "Contact Support" clicks.
            models.UniqueConstraint(
                fields=["initiator"],
                condition=models.Q(is_support=True),
                name="unique_support_conversation_per_initiator",
            ),
        ]
        indexes = [
            models.Index(fields=["initiator"]),
            models.Index(fields=["landlord"]),
            models.Index(fields=["is_support"]),
            models.Index(fields=["last_message_at"]),
        ]

    def __str__(self) -> str:
        if self.is_support:
            return f"SupportConversation({self.initiator_id})"
        return f"Conversation({self.initiator_id} <-> {self.landlord_id})"


class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    body = models.TextField()
    client_key = models.UUIDField(null=True, blank=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"Message({self.id}, {self.sender_id})"
