"""Panorama model."""
from django.conf import settings
from django.db import models


class Panorama(models.Model):
    PROJECTION_EQUIRECTANGULAR = "equirectangular"
    PROJECTION_CYLINDRICAL = "cylindrical"
    PROJECTION_CHOICES = [
        (PROJECTION_EQUIRECTANGULAR, "Equirectangular"),
        (PROJECTION_CYLINDRICAL, "Cylindrical"),
    ]

    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_READY, "Ready"),
        (STATUS_FAILED, "Failed"),
    ]

    listing = models.ForeignKey(
        "listings.Listing",
        on_delete=models.CASCADE,
        related_name="panoramas",
    )
    room_label = models.CharField(max_length=100)
    original_key = models.CharField(max_length=500, blank=True)
    tiles_prefix = models.CharField(max_length=500, blank=True)
    thumbnail_key = models.CharField(max_length=500, blank=True)
    preview_key = models.CharField(max_length=500, blank=True)
    projection = models.CharField(
        max_length=20, choices=PROJECTION_CHOICES, blank=True
    )
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    failure_reason = models.TextField(blank=True)
    ordering = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["ordering", "id"]
        indexes = [models.Index(fields=["listing", "status"])]

    def __str__(self) -> str:
        return f"Panorama({self.id}, {self.room_label}, {self.status})"
