"""Serializers for common/cross-cutting models."""
from rest_framework import serializers

from .models import AdminActionLog


class AdminActionLogSerializer(serializers.ModelSerializer):
    admin_email = serializers.CharField(source="admin.email", default=None, read_only=True)
    target_user_email = serializers.CharField(source="target_user.email", default=None, read_only=True)
    target_listing_title = serializers.CharField(source="target_listing.title", default=None, read_only=True)

    class Meta:
        model = AdminActionLog
        fields = [
            "id", "action", "admin_email", "target_user_email",
            "target_listing_title", "notes", "created_at",
        ]
