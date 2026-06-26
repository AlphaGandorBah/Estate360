from django.contrib import admin
from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "initiator", "landlord", "is_support", "listing", "last_message_at"]
    list_filter = ["is_support"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "sender", "created_at", "read_at"]
    list_filter = ["read_at"]
