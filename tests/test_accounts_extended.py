"""Extended accounts tests — me view, public profile, auth flows."""
import pytest


@pytest.mark.django_db
class TestMeView:
    def test_get_profile(self, tenant_client, tenant_user):
        resp = tenant_client.get("/api/v1/users/me")
        assert resp.status_code == 200
        assert resp.data["email"] == tenant_user.email
        assert resp.data["role"] == "tenant"

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/v1/users/me")
        assert resp.status_code == 401

    def test_patch_full_name(self, tenant_client, tenant_user):
        resp = tenant_client.patch(
            "/api/v1/users/me",
            {"full_name": "Updated Name"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["full_name"] == "Updated Name"
        tenant_user.refresh_from_db()
        assert tenant_user.full_name == "Updated Name"

    def test_patch_phone(self, tenant_client):
        resp = tenant_client.patch(
            "/api/v1/users/me",
            {"phone": "+23276000000"},
            format="json",
        )
        assert resp.status_code == 200

    def test_delete_soft_deletes_user(self, tenant_client, tenant_user):
        resp = tenant_client.delete("/api/v1/users/me")
        assert resp.status_code == 204
        tenant_user.refresh_from_db()
        assert tenant_user.deleted_at is not None

    def test_delete_archives_active_listings(self, landlord_client, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="My Listing",
            description="desc",
            property_type="apartment",
            bedrooms=1,
            bathrooms=1,
            price_annual=5_000_000,
            currency="SLE",
            location_area="aberdeen",
            status=ListingStatus.APPROVED,
        )
        resp = landlord_client.delete("/api/v1/users/me")
        assert resp.status_code == 204
        listing.refresh_from_db()
        assert listing.status == "archived"


@pytest.mark.django_db
class TestPublicUserView:
    def test_get_public_profile(self, api_client, verified_landlord):
        resp = api_client.get(f"/api/v1/users/{verified_landlord.pk}/public")
        assert resp.status_code == 200
        assert str(resp.data["id"]) == str(verified_landlord.pk)

    def test_not_found_returns_404(self, api_client):
        import uuid
        fake_id = str(uuid.uuid4())
        resp = api_client.get(f"/api/v1/users/{fake_id}/public")
        assert resp.status_code == 404

    def test_deleted_user_returns_404(self, api_client, tenant_user):
        from django.utils import timezone
        tenant_user.deleted_at = timezone.now()
        tenant_user.save()
        resp = api_client.get(f"/api/v1/users/{tenant_user.pk}/public")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestPasswordResetFlow:
    def test_request_otp_for_valid_email(self, api_client, tenant_user):
        resp = api_client.post(
            "/api/v1/auth/password-reset",
            {"email": tenant_user.email},
            format="json",
        )
        assert resp.status_code == 200

    def test_request_otp_nonexistent_email(self, api_client):
        # Should return 200 even for unknown email (prevents enumeration)
        resp = api_client.post(
            "/api/v1/auth/password-reset",
            {"email": "nobody@example.com"},
            format="json",
        )
        assert resp.status_code == 200

    def test_confirm_with_valid_otp(self, api_client, tenant_user):
        from apps.accounts.otp import create_otp
        otp = create_otp(tenant_user, purpose="password_reset")
        resp = api_client.post(
            "/api/v1/auth/password-reset/confirm",
            {
                "email": tenant_user.email,
                "code": otp.code,
                "new_password": "NewSecurePass@456",
            },
            format="json",
        )
        assert resp.status_code == 200

    def test_confirm_with_wrong_otp(self, api_client, tenant_user):
        resp = api_client.post(
            "/api/v1/auth/password-reset/confirm",
            {
                "email": tenant_user.email,
                "code": "000000",
                "new_password": "NewSecurePass@456",
            },
            format="json",
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestResendOTP:
    def test_resend_for_valid_user(self, api_client, tenant_user):
        resp = api_client.post(
            "/api/v1/auth/verify-email/resend",
            {"email": tenant_user.email, "purpose": "verify_email"},
            format="json",
        )
        assert resp.status_code in (200, 429)  # 429 if resend cooldown not elapsed

    def test_resend_nonexistent_user_returns_200(self, api_client):
        # Returns 200 even for unknown email to prevent enumeration
        resp = api_client.post(
            "/api/v1/auth/verify-email/resend",
            {"email": "ghost@example.com"},
            format="json",
        )
        assert resp.status_code == 200


@pytest.mark.django_db
class TestLogoutRefresh:
    def test_logout_requires_web_header(self, tenant_client):
        # Without X-Requested-With: estate360-web header → 400
        resp = tenant_client.post("/api/v1/auth/logout")
        assert resp.status_code in (400, 403)

    def test_refresh_requires_web_header(self, api_client):
        # Endpoint is /api/v1/auth/refresh, not /token/refresh
        resp = api_client.post("/api/v1/auth/refresh")
        assert resp.status_code in (400, 403)
