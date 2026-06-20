"""Notification model."""
from django.conf import settings
from django.db import models


class Notification(models.Model):
    TYPE_LISTING_DECISION = "listing_decision"
    TYPE_VERIFICATION_RESULT = "verification_result"
    TYPE_NEW_MESSAGE = "new_message"
    TYPE_REPORT_UPDATE = "report_update"
    TYPE_PANORAMA_READY = "panorama_ready"
    TYPE_CHOICES = [
        (TYPE_LISTING_DECISION, "Listing Decision"),
        (TYPE_VERIFICATION_RESULT, "Verification Result"),
        (TYPE_NEW_MESSAGE, "New Message"),
        (TYPE_REPORT_UPDATE, "Report Update"),
        (TYPE_PANORAMA_READY, "Panorama Ready"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    payload = models.JSONField(default=dict)
    is_read = models.BooleanField(default=False)
    is_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"Notification({self.type}, user={self.user_id})"
