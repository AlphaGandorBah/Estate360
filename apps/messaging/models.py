"""Conversation and Message models."""

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    # The user who started the thread. For a property enquiry this is always
    # the tenant (only tenants can start those); for a support conversation
    # it is whichever public account reached out.
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_conversations",
    )
    # Null for support conversations, which aren't tied to one specific
    # admin — any admin can see and reply to them (a shared inbox).
    # This legacy field name is retained for database/API compatibility. It
    # stores the listing contact, which may be either a landlord or an agent;
    # provider_* are the preferred neutral names in API responses.
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
            # SQL unique constraints treat NULL values as distinct, so the
            # legacy unique_together above does not protect general enquiries
            # whose listing is null. Keep one listing-less thread per tenant
            # and property provider, while leaving listing-specific threads
            # and support conversations unchanged.
            models.UniqueConstraint(
                fields=["initiator", "landlord"],
                condition=models.Q(
                    is_support=False,
                    listing__isnull=True,
                    landlord__isnull=False,
                ),
                name="unique_general_conversation_per_provider",
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
