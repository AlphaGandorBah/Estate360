"""Tests for messaging REST endpoints."""
import pytest


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
            tenant=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        resp = tenant_client.get("/api/v1/conversations/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1


@pytest.mark.django_db
class TestMessages:
    def test_send_message_rest(self, tenant_client, tenant_user, verified_landlord, approved_listing):
        from apps.messaging.models import Conversation
        conv = Conversation.objects.create(
            tenant=tenant_user, landlord=verified_landlord, listing=approved_listing
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
            tenant=tenant_user, landlord=verified_landlord, listing=approved_listing
        )
        client_key = "770e8400-e29b-41d4-a716-446655440002"
        payload = {"body": "Hello!", "client_key": client_key}
        r1 = tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", payload, format="json")
        r2 = tenant_client.post(f"/api/v1/conversations/{conv.pk}/messages", payload, format="json")
        assert r1.status_code == 201
        assert r2.status_code == 200
        assert r1.data["id"] == r2.data["id"]
