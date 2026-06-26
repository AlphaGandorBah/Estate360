"""Messaging serializers."""
from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source="sender.id", read_only=True)
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "sender_id", "sender_name", "body", "client_key", "read_at", "created_at"]
        read_only_fields = ["id", "sender_id", "sender_name", "read_at", "created_at"]


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1)
    client_key = serializers.UUIDField(required=False, allow_null=True)


class ConversationSerializer(serializers.ModelSerializer):
    initiator_id = serializers.UUIDField(source="initiator.id", read_only=True)
    initiator_name = serializers.CharField(source="initiator.full_name", read_only=True)
    initiator_role = serializers.CharField(source="initiator.role", read_only=True)
    landlord_id = serializers.UUIDField(source="landlord.id", allow_null=True, read_only=True)
    landlord_name = serializers.CharField(source="landlord.full_name", allow_null=True, read_only=True)
    listing_id = serializers.IntegerField(source="listing.id", allow_null=True, read_only=True)
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "initiator_id",
            "initiator_name",
            "initiator_role",
            "landlord_id",
            "landlord_name",
            "is_support",
            "listing_id",
            "last_message_at",
            "unread_count",
            "created_at",
        ]

    def get_unread_count(self, obj) -> int:
        request = self.context.get("request")
        if not request:
            return 0
        return obj.messages.filter(read_at__isnull=True).exclude(sender=request.user).count()


class StartConversationSerializer(serializers.Serializer):
    support = serializers.BooleanField(required=False, default=False)
    landlord_id = serializers.UUIDField(required=False, allow_null=True)
    listing_id = serializers.IntegerField(required=False, allow_null=True)
    initial_message = serializers.CharField(required=False, allow_blank=True)
