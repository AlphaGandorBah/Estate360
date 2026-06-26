"""Common models: IdempotencyKey, AdminActionLog."""
import hashlib
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class IdempotencyKey(models.Model):
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"
    STATUS_CHOICES = [
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_DONE, "Done"),
    ]

    key = models.UUIDField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="idempotency_keys",
    )
    request_hash = models.CharField(max_length=64)  # SHA-256 hex
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS)
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # Unique per (user, key) for authenticated calls
            models.UniqueConstraint(
                fields=["user", "key"],
                condition=models.Q(user__isnull=False),
                name="unique_user_idempotency_key",
            ),
            # Unique on key alone for anonymous calls
            models.UniqueConstraint(
                fields=["key"],
                condition=models.Q(user__isnull=True),
                name="unique_anon_idempotency_key",
            ),
        ]
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self) -> str:
        return f"IdempotencyKey({self.key}, {self.status})"

    @classmethod
    def compute_hash(cls, body: bytes) -> str:
        return hashlib.sha256(body).hexdigest()

    @classmethod
    def default_expiry(cls):
        return timezone.now() + timedelta(seconds=settings.IDEMPOTENCY_KEY_TTL_SECONDS)


class AdminActionLog(models.Model):
    """Audit trail for admin moderation actions on users and listings."""

    ACTION_BAN_USER = "ban_user"
    ACTION_UNBAN_USER = "unban_user"
    ACTION_RESTRICT_USER = "restrict_user"
    ACTION_UNRESTRICT_USER = "unrestrict_user"
    ACTION_RESET_PASSWORD = "reset_password"
    ACTION_DELETE_USER = "delete_user"
    ACTION_DELETE_LISTING = "delete_listing"
    ACTION_WARN_USER = "warn_user"
    ACTION_CHOICES = [
        (ACTION_BAN_USER, "Banned user"),
        (ACTION_UNBAN_USER, "Unbanned user"),
        (ACTION_RESTRICT_USER, "Restricted user"),
        (ACTION_UNRESTRICT_USER, "Unrestricted user"),
        (ACTION_RESET_PASSWORD, "Sent password reset"),
        (ACTION_DELETE_USER, "Deleted user"),
        (ACTION_DELETE_LISTING, "Deleted listing"),
        (ACTION_WARN_USER, "Warned user"),
    ]

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="admin_actions_taken",
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_actions_received",
    )
    target_listing = models.ForeignKey(
        "listings.Listing",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_actions",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_at"])]

    def __str__(self) -> str:
        return f"AdminActionLog({self.action}, admin={self.admin_id})"
