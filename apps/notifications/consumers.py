"""
WebSocket consumer for /ws/notifications/.
Server-push only. Auth via subprotocol JWT (same as messaging consumer).
"""
import json

import structlog
from channels.generic.websocket import AsyncWebsocketConsumer

logger = structlog.get_logger(__name__)


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = await self._authenticate()
        if user is None:
            await self.close(code=4401)
            return

        self.user = user
        self.group_name = f"notifications_{user.pk}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept(subprotocol="bearer")
        logger.info("notif_ws_connected", user_id=str(user.id))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Server-push only — ignore incoming frames
        pass

    async def notification_push(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

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
