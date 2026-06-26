"""Tests for admin user moderation actions: ban, restrict, reset password, delete."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


def _client_for(user):
    """Independent APIClient for a user, separate from the admin_client/tenant_client/
    landlord_client fixtures — those all share one underlying APIClient instance, so
    requesting two of them in the same test makes the second overwrite the first's
    credentials. Needed here because some tests act as two different users at once."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.mark.django_db
class TestAdminUserAction:
    def test_ban_blocks_login(self, admin_client, tenant_user):
        # Token minted while the account was still active — simulates an
        # already-logged-in session at the moment the admin bans the user.
        already_logged_in = _client_for(tenant_user)

        resp = admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "ban"}, format="json")
        assert resp.status_code == 200
        tenant_user.refresh_from_db()
        assert tenant_user.is_active is False

        # The existing session's token is rejected immediately, not just future logins
        resp = already_logged_in.get("/api/v1/users/me")
        assert resp.status_code == 401

    def test_unban_restores_access(self, admin_client, tenant_user):
        admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "ban"}, format="json")
        resp = admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "unban"}, format="json")
        assert resp.status_code == 200
        tenant_user.refresh_from_db()
        assert tenant_user.is_active is True

    def test_restrict_blocks_listing_creation(self, admin_client, verified_landlord):
        resp = admin_client.post(f"/api/v1/admin/users/{verified_landlord.pk}/action", {"action": "restrict"}, format="json")
        assert resp.status_code == 200
        verified_landlord.refresh_from_db()
        assert verified_landlord.is_restricted is True

        resp = _client_for(verified_landlord).post(
            "/api/v1/listings/",
            {
                "title": "Should be blocked", "description": "desc", "property_type": "room",
                "bedrooms": 1, "bathrooms": 1, "price_annual": 1000, "currency": "SLE",
                "location_area": "lumley",
            },
            format="json",
        )
        assert resp.status_code == 403
        assert resp.data["code"] == "restricted"

    def test_restrict_does_not_block_login_or_browsing(self, admin_client, verified_landlord):
        admin_client.post(f"/api/v1/admin/users/{verified_landlord.pk}/action", {"action": "restrict"}, format="json")
        resp = _client_for(verified_landlord).get("/api/v1/users/me")
        assert resp.status_code == 200

    def test_unrestrict_allows_listing_creation_again(self, admin_client, verified_landlord):
        admin_client.post(f"/api/v1/admin/users/{verified_landlord.pk}/action", {"action": "restrict"}, format="json")
        admin_client.post(f"/api/v1/admin/users/{verified_landlord.pk}/action", {"action": "unrestrict"}, format="json")
        resp = _client_for(verified_landlord).post(
            "/api/v1/listings/",
            {
                "title": "Allowed again", "description": "desc", "property_type": "room",
                "bedrooms": 1, "bathrooms": 1, "price_annual": 1000, "currency": "SLE",
                "location_area": "lumley",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_reset_password_sends_email(self, admin_client, tenant_user, mailoutbox):
        resp = admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "reset_password"}, format="json")
        assert resp.status_code == 200
        assert len(mailoutbox) == 1
        assert tenant_user.email in mailoutbox[0].to

    def test_invalid_action_rejected(self, admin_client, tenant_user):
        resp = admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "nuke"}, format="json")
        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_action"

    def test_cannot_act_on_self(self, admin_client, admin_user):
        resp = admin_client.post(f"/api/v1/admin/users/{admin_user.pk}/action", {"action": "ban"}, format="json")
        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_target"

    def test_cannot_act_on_other_admins(self, admin_client, db):
        from apps.accounts.models import User
        other_admin = User.objects.create_superuser(
            email="other_admin@test.com", password="TestPass@123", full_name="Other Admin", role="admin",
        )
        resp = admin_client.post(f"/api/v1/admin/users/{other_admin.pk}/action", {"action": "ban"}, format="json")
        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_target"

    def test_non_admin_forbidden(self, landlord_client, tenant_user):
        resp = landlord_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "ban"}, format="json")
        assert resp.status_code == 403

    def test_action_logged(self, admin_client, admin_user, tenant_user):
        from apps.common.models import AdminActionLog
        admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "ban"}, format="json")
        entry = AdminActionLog.objects.latest("created_at")
        assert entry.action == AdminActionLog.ACTION_BAN_USER
        assert entry.admin_id == admin_user.id
        assert entry.target_user_id == tenant_user.id


@pytest.mark.django_db
class TestAdminUserDelete:
    def test_delete_soft_deletes_user(self, admin_client, tenant_user):
        resp = admin_client.delete(f"/api/v1/admin/users/{tenant_user.pk}")
        assert resp.status_code == 204
        tenant_user.refresh_from_db()
        assert tenant_user.is_soft_deleted

    def test_delete_archives_listings(self, admin_client, verified_landlord, approved_listing):
        resp = admin_client.delete(f"/api/v1/admin/users/{verified_landlord.pk}")
        assert resp.status_code == 204
        approved_listing.refresh_from_db()
        assert approved_listing.status == "archived"

    def test_delete_not_found(self, admin_client):
        resp = admin_client.delete("/api/v1/admin/users/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_non_admin_forbidden(self, landlord_client, tenant_user):
        resp = landlord_client.delete(f"/api/v1/admin/users/{tenant_user.pk}")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestAdminActionLog:
    def test_lists_entries(self, admin_client, tenant_user):
        admin_client.post(f"/api/v1/admin/users/{tenant_user.pk}/action", {"action": "ban"}, format="json")
        resp = admin_client.get("/api/v1/admin/action-log/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_non_admin_forbidden(self, landlord_client):
        resp = landlord_client.get("/api/v1/admin/action-log/")
        assert resp.status_code == 403
