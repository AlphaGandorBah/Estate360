"""FraudReport model."""
from django.conf import settings
from django.db import models


class FraudReport(models.Model):
    REASON_FAKE_LISTING = "fake_listing"
    REASON_MISLEADING = "misleading"
    REASON_SCAM = "scam"
    REASON_WRONG_PRICE = "wrong_price"
    REASON_NOT_AVAILABLE = "not_available"
    # Conduct reasons, used when reporting a user (landlord or tenant)
    # directly rather than a listing.
    REASON_HARASSMENT = "harassment"
    REASON_ABUSIVE_BEHAVIOR = "abusive_behavior"
    REASON_NON_PAYMENT = "non_payment"
    REASON_PROPERTY_DAMAGE = "property_damage"
    REASON_UNRESPONSIVE = "unresponsive"
    REASON_OTHER = "other"
    REASON_CHOICES = [
        (REASON_FAKE_LISTING, "Fake Listing"),
        (REASON_MISLEADING, "Misleading Information"),
        (REASON_SCAM, "Scam"),
        (REASON_WRONG_PRICE, "Wrong Price"),
        (REASON_NOT_AVAILABLE, "Not Available"),
        (REASON_HARASSMENT, "Harassment"),
        (REASON_ABUSIVE_BEHAVIOR, "Abusive Behavior"),
        (REASON_NON_PAYMENT, "Non-payment"),
        (REASON_PROPERTY_DAMAGE, "Property Damage"),
        (REASON_UNRESPONSIVE, "Unresponsive"),
        (REASON_OTHER, "Other"),
    ]

    STATUS_OPEN = "open"
    STATUS_REVIEWING = "reviewing"
    STATUS_RESOLVED = "resolved"
    STATUS_DISMISSED = "dismissed"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_REVIEWING, "Reviewing"),
        (STATUS_RESOLVED, "Resolved"),
        (STATUS_DISMISSED, "Dismissed"),
    ]

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="filed_reports",
    )
    listing = models.ForeignKey(
        "listings.Listing",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fraud_reports",
    )
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reports_against",
    )
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="handled_reports",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return f"FraudReport({self.id}, {self.reason}, {self.status})"
