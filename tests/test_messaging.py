"""Tests for messaging REST endpoints."""
import pytest

from apps.notifications.models import Notification


@pytest.mark.django_db
class TestConversations:
    def test_start_conversation(self, tenant_client, verified_landlord, approved_listing):
        resp = tenant_client.post(
            "/api/v1/conversations/",
            {
                "landlord_id": str(verified_landlord.id),
                "listing_id": approved_listing.id,
                "initial_message": "Hello, is this available?",
            },
            format="json",
        )
        assert resp.status_code in (200, 201)
        assert "id" in resp.data

    def test_start_conversation_idempotent(self, tenant_client, verified_landlord, approved_listing):
        payload = {"landlord_id": str(verified_landlord.id), "listing_id": approved_listing.id}
        key = "660e8400-e29b-41d4-a716-446655440001"
        r1 = tenant_client.post("/api/v1/conversations/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        r2 = tenant_client.post("/api/v1/conversations/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code in (200, 201)
        assert r2.status_code in (200, 201)
        assert r1.data["id"] == r2.data["id"]

    def test_landlord_cannot_start(self, landlord_client, tenant_user):
        resp = landlord_client.post(
            "/api/v1/conversations/",
            {"landlord_id": str(tenant_user.id)},
            format="json",
        )
        assert resp.status_code == 403

    def test_list_conversations(self, tenant_client, tenant_user, verified_landlord, approved_listing):
        from apps.messaging.models import Conversation
        Conversation.objects.create(
            initiator=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        resp = tenant_client.get("/api/v1/conversations/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_get_conversation_detail(self, tenant_client, tenant_user, verified_landlord, approved_listing):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(
            initiator=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        resp = tenant_client.get(f"/api/v1/conversations/{conv.pk}")
        assert resp.status_code == 200
        assert resp.data["id"] == conv.pk

    def test_get_conversation_detail_forbidden_for_non_participant(
        self, admin_client, tenant_user, verified_landlord, approved_listing
    ):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(
            initiator=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        resp = admin_client.get(f"/api/v1/conversations/{conv.pk}")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestSupportConversations:
    def test_tenant_can_start_support_conversation(self, tenant_client):
        resp = tenant_client.post(
            "/api/v1/conversations/", {"support": True, "initial_message": "Need help."}, format="json"
        )
        assert resp.status_code == 201
        assert resp.data["is_support"] is True
        assert resp.data["landlord_id"] is None

    def test_landlord_can_start_support_conversation(self, landlord_client):
        resp = landlord_client.post("/api/v1/conversations/", {"support": True}, format="json")
        assert resp.status_code == 201
        assert resp.data["is_support"] is True

    def test_starting_support_conversation_twice_returns_same_thread(self, tenant_client):
        r1 = tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        r2 = tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        assert r1.data["id"] == r2.data["id"]
        assert r2.status_code == 200

    def test_admin_cannot_start_support_conversation(self, admin_client):
        resp = admin_client.post("/api/v1/conversations/", {"support": True}, format="json")
        assert resp.status_code == 403

    def test_admin_cannot_start_landlord_conversation(self, admin_client, verified_landlord):
        resp = admin_client.post(
            "/api/v1/conversations/", {"landlord_id": str(verified_landlord.id)}, format="json"
        )
        assert resp.status_code == 403

    def test_admin_sees_support_conversations_in_list(self, admin_client, tenant_client):
        tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        resp = admin_client.get("/api/v1/conversations/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1
        assert all(c["is_support"] for c in resp.data["results"])

    def test_admin_does_not_see_landlord_tenant_conversations(
        self, admin_client, tenant_user, verified_landlord, approved_listing
    ):
        from apps.messaging.models import Conversation
        Conversation.objects.create(initiator=tenant_user, landlord=verified_landlord, listing=approved_listing)
        resp = admin_client.get("/api/v1/conversations/")
        assert resp.status_code == 200
        assert resp.data["count"] == 0

    def test_admin_can_reply_to_support_conversation(self, admin_client, tenant_client):
        start = tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        conv_id = start.data["id"]
        resp = admin_client.post(
            f"/api/v1/conversations/{conv_id}/messages", {"body": "How can we help?"}, format="json"
        )
        assert resp.status_code == 201

    def test_other_tenant_cannot_see_someone_elses_support_conversation(self, tenant_client, db):
        from apps.accounts.models import User
        from apps.messaging.models import Conversation
        other_tenant = User.objects.create_user(
            email="other-tenant@test.com", password="TestPass@123", full_name="Other Tenant", role="tenant",
        )
        Conversation.objects.create(initiator=other_tenant, is_support=True)
        resp = tenant_client.get("/api/v1/conversations/")
        assert resp.data["count"] == 0


@pytest.mark.django_db
class TestMessages:
    def test_send_message_rest(self, tenant_client, tenant_user, verified_landlord, approved_listing):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(
            initiator=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        resp = tenant_client.post(
            f"/api/v1/conversations/{conv.pk}/messages",
            {"body": "Is this listing still available?"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["body"] == "Is this listing still available?"

    def test_message_deduplication_by_client_key(self, tenant_client, tenant_user, verified_landlord, approved_listing):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(
            initiator=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        client_key = "770e8400-e29b-41d4-a716-446655440002"
        payload = {"body": "Hello!", "client_key": client_key}
        r1 = tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", payload, format="json")
        r2 = tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", payload, format="json")
        assert r1.status_code == 201
        assert r2.status_code == 200
        assert r1.data["id"] == r2.data["id"]


@pytest.mark.django_db
class TestMessageNotifications:
    """A new message must notify the other side so the conversation list
    (which has no WS room of its own) can update live instead of requiring
    a manual refresh."""

    def test_sending_message_notifies_other_party(
        self, tenant_client, tenant_user, verified_landlord, approved_listing
    ):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(initiator=tenant_user, landlord=verified_landlord, listing=approved_listing)
        tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", {"body": "Hi"}, format="json")
        assert Notification.objects.filter(
            user=verified_landlord, type=Notification.TYPE_NEW_MESSAGE, payload__conversation_id=conv.pk
        ).exists()

    def test_sending_message_does_not_notify_sender(
        self, tenant_client, tenant_user, verified_landlord, approved_listing
    ):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(initiator=tenant_user, landlord=verified_landlord, listing=approved_listing)
        tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", {"body": "Hi"}, format="json")
        assert not Notification.objects.filter(user=tenant_user).exists()

    def test_initial_message_on_new_conversation_notifies_landlord(
        self, tenant_client, verified_landlord, approved_listing
    ):
        tenant_client.post(
            "/api/v1/conversations/",
            {"landlord_id": str(verified_landlord.id), "listing_id": approved_listing.id, "initial_message": "Hi"},
            format="json",
        )
        assert Notification.objects.filter(user=verified_landlord, type=Notification.TYPE_NEW_MESSAGE).exists()

    def test_support_message_notifies_all_admins(self, tenant_client, admin_user):
        from apps.accounts.models import User
        other_admin = User.objects.create_user(
            email="other-admin@test.com", password="TestPass@123", full_name="Other Admin", role="admin",
        )
        start = tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        conv_id = start.data["id"]
        tenant_client.post(f"/api/v1/conversations/{conv_id}/messages", {"body": "Help!"}, format="json")
        assert Notification.objects.filter(user=admin_user, type=Notification.TYPE_NEW_MESSAGE).exists()
        assert Notification.objects.filter(user=other_admin, type=Notification.TYPE_NEW_MESSAGE).exists()

    def test_admin_reply_notifies_initiator_only(self, admin_client, admin_user, tenant_client, tenant_user):
        start = tenant_client.post("/api/v1/conversations/", {"support": True}, format="json")
        conv_id = start.data["id"]
        admin_client.post(f"/api/v1/conversations/{conv_id}/messages", {"body": "How can we help?"}, format="json")
        assert Notification.objects.filter(user=tenant_user, type=Notification.TYPE_NEW_MESSAGE).exists()
        assert not Notification.objects.filter(user=admin_user, type=Notification.TYPE_NEW_MESSAGE).exists()


@pytest.mark.django_db(transaction=True)
async def test_passive_websocket_listener_receives_message_without_refresh():
    """The whole point of the WS room: a party who already has the
    conversation open must see the other side's message arrive live,
    with no refresh or refetch."""
    from channels.db import database_sync_to_async
    from channels.routing import URLRouter
    from channels.testing import WebsocketCommunicator
    from django.test import Client
    from rest_framework_simplejwt.tokens import RefreshToken
    from apps.accounts.models import User
    from apps.messaging.models import Conversation
    from apps.messaging.routing import websocket_urlpatterns

    @database_sync_to_async
    def setup():
        tenant = User.objects.create_user(
            email="live-tenant@test.com", password="TestPass@123", full_name="T", role="tenant", is_verified=True
        )
        landlord = User.objects.create_user(
            email="live-landlord@test.com", password="TestPass@123", full_name="L", role="landlord", is_verified=True
        )
        conv = Conversation.objects.create(initiator=tenant, landlord=landlord)
        landlord_token = str(RefreshToken.for_user(landlord).access_token)
        tenant_token = str(RefreshToken.for_user(tenant).access_token)
        return conv.id, landlord_token, tenant_token

    conv_id, landlord_token, tenant_token = await setup()

    app = URLRouter(websocket_urlpatterns)
    communicator = WebsocketCommunicator(
        app, f"/ws/conversations/{conv_id}/", subprotocols=["bearer", landlord_token]
    )
    connected, _ = await communicator.connect()
    assert connected, "landlord WS failed to connect"

    @database_sync_to_async
    def send_via_rest():
        client = Client()
        return client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            data={"body": "hello from tenant"},
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {tenant_token}",
        ).status_code

    status = await send_via_rest()
    assert status == 201

    event = await communicator.receive_json_from(timeout=5)
    assert event["type"] == "message.new"
    assert event["body"] == "hello from tenant"

    await communicator.disconnect()
