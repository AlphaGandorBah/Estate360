"""
WebSocket consumer for /ws/conversations/{id}/.

Auth: access token passed via Sec-WebSocket-Protocol subprotocol header.
    Sec-WebSocket-Protocol: bearer, <jwt-access-token>
"""
import json
import uuid

import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

logger = structlog.get_logger(__name__)

# Per-connection rate limit: 20 messages per 10 seconds
_RATE_LIMIT = 20
_RATE_WINDOW = 10


class ConversationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self._msg_times: list[float] = []
        self.conversation_id = self.scope["url_route"]["kwargs"]["pk"]
        self.group_name = f"conversation_{self.conversation_id}"

        # Authenticate via subprotocol
        user = await self._authenticate()
        if user is None:
            await self.close(code=4401)
            return

        self.user = user

        # Verify conversation participant
        is_participant = await self._check_participant()
        if not is_participant:
            await self.close(code=4403)
            return

        # Accept with the "bearer" subprotocol echoed back
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept(subprotocol="bearer")
        logger.info("ws_connected", conversation_id=self.conversation_id, user_id=str(self.user.id))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        import time
        now = time.monotonic()
        # Enforce per-connection rate limit
        self._msg_times = [t for t in self._msg_times if now - t < _RATE_WINDOW]
        if len(self._msg_times) >= _RATE_LIMIT:
            await self.send(text_data=json.dumps({
                "type": "error",
                "code": "rate_limited",
                "detail": "Too many messages. Slow down.",
            }))
            return
        self._msg_times.append(now)

        try:
            data = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"type": "error", "code": "invalid_json", "detail": "Invalid JSON."}))
            return

        msg_type = data.get("type")
        if msg_type == "message.send":
            await self._handle_send(data)
        else:
            await self.send(text_data=json.dumps({"type": "error", "code": "unknown_type", "detail": f"Unknown type: {msg_type}"}))

    async def _handle_send(self, data: dict):
        body = data.get("body", "").strip()
        if not body:
            await self.send(text_data=json.dumps({"type": "error", "code": "empty_body", "detail": "Body cannot be empty."}))
            return

        client_key_raw = data.get("client_key")
        client_key = None
        if client_key_raw:
            try:
                client_key = uuid.UUID(str(client_key_raw))
            except ValueError:
                pass

        message = await self._create_or_get_message(body, client_key)
        payload = {
            "type": "message.new",
            "id": message["id"],
            "sender_id": str(self.user.id),
            "body": message["body"],
            "created_at": message["created_at"],
            "client_key": str(message["client_key"]) if message["client_key"] else None,
        }
        await self.channel_layer.group_send(self.group_name, {"type": "chat_message", "payload": payload})

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def message_read(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _authenticate(self):
        from channels.db import database_sync_to_async
        from rest_framework_simplejwt.tokens import UntypedToken
        from rest_framework_simplejwt.exceptions import TokenError
        from django.contrib.auth import get_user_model

        subprotocols = self.scope.get("subprotocols", [])
        token = None
        for i, proto in enumerate(subprotocols):
            if proto == "bearer" and i + 1 < len(subprotocols):
                token = subprotocols[i + 1]
                break

        if not token:
            return None

        try:
            validated = UntypedToken(token)
            user_id = validated.get("user_id")
        except TokenError:
            return None

        User = get_user_model()

        @database_sync_to_async
        def get_user():
            try:
                return User.objects.get(pk=user_id, is_active=True)
            except User.DoesNotExist:
                return None

        return await get_user()

    async def _check_participant(self):
        from channels.db import database_sync_to_async
        from .models import Conversation

        @database_sync_to_async
        def check():
            try:
                c = Conversation.objects.get(pk=self.conversation_id)
                return self.user in (c.tenant, c.landlord)
            except Conversation.DoesNotExist:
                return False

        return await check()

    async def _create_or_get_message(self, body: str, client_key):
        from channels.db import database_sync_to_async
        from .models import Conversation, Message

        @database_sync_to_async
        def _db():
            from django.utils import timezone as tz

            # Deduplicate by client_key
            if client_key:
                existing = Message.objects.filter(
                    conversation_id=self.conversation_id, client_key=client_key
                ).first()
                if existing:
                    return {
                        "id": existing.id,
                        "body": existing.body,
                        "created_at": existing.created_at.isoformat(),
                        "client_key": existing.client_key,
                    }

            msg = Message.objects.create(
                conversation_id=self.conversation_id,
                sender=self.user,
                body=body,
                client_key=client_key,
            )
            Conversation.objects.filter(pk=self.conversation_id).update(last_message_at=tz.now())
            return {
                "id": msg.id,
                "body": msg.body,
                "created_at": msg.created_at.isoformat(),
                "client_key": msg.client_key,
            }

        return await _db()
