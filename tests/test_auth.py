"""Tests for authentication endpoints."""
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


@pytest.mark.django_db
class TestRegister:
    url = "/api/v1/auth/register"

    def test_register_tenant_success(self, api_client):
        data = {
            "email": "newuser@test.com",
            "full_name": "New User",
            "role": "tenant",
            "password": "StrongPass@123",
        }
        resp = api_client.post(self.url, data, format="json")
        assert resp.status_code == 201
        assert User.objects.filter(email="newuser@test.com").exists()

    def test_register_duplicate_email(self, api_client, tenant_user):
        data = {
            "email": tenant_user.email,
            "full_name": "Dup",
            "role": "tenant",
            "password": "StrongPass@123",
        }
        resp = api_client.post(self.url, data, format="json")
        assert resp.status_code == 400

    def test_register_invalid_role(self, api_client):
        data = {
            "email": "x@x.com",
            "full_name": "X",
            "role": "admin",
            "password": "StrongPass@123",
        }
        resp = api_client.post(self.url, data, format="json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestLogin:
    url = "/api/v1/auth/login"

    def test_login_success(self, api_client, tenant_user):
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "TestPass@123"}, format="json")
        assert resp.status_code == 200
        assert "access" in resp.data

    def test_login_wrong_password(self, api_client, tenant_user):
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "wrong"}, format="json")
        assert resp.status_code == 401

    def test_login_unknown_email(self, api_client):
        resp = api_client.post(self.url, {"email": "nobody@x.com", "password": "pass"}, format="json")
        assert resp.status_code == 401


@pytest.mark.django_db
class TestVerifyEmail:
    url = "/api/v1/auth/verify-email"

    def test_verify_success(self, api_client, tenant_user):
        from apps.accounts.otp import create_otp
        from apps.accounts.models import EmailOTP
        otp = create_otp(tenant_user.email, EmailOTP.PURPOSE_VERIFY)
        resp = api_client.post(self.url, {"email": tenant_user.email, "code": otp.code}, format="json")
        assert resp.status_code == 200
        tenant_user.refresh_from_db()
        assert tenant_user.is_verified

    def test_verify_wrong_code(self, api_client, tenant_user):
        from apps.accounts.otp import create_otp
        from apps.accounts.models import EmailOTP
        create_otp(tenant_user.email, EmailOTP.PURPOSE_VERIFY)
        resp = api_client.post(self.url, {"email": tenant_user.email, "code": "000000"}, format="json")
        assert resp.status_code == 400

    def test_verify_expired_otp(self, api_client, tenant_user):
        from apps.accounts.models import EmailOTP
        from apps.accounts.otp import create_otp
        from django.utils import timezone
        from datetime import timedelta
        otp = create_otp(tenant_user.email, EmailOTP.PURPOSE_VERIFY)
        EmailOTP.objects.filter(pk=otp.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        resp = api_client.post(self.url, {"email": tenant_user.email, "code": otp.code}, format="json")
        assert resp.status_code == 400
        assert resp.data["code"] == "expired"


@pytest.mark.django_db
class TestPasswordReset:
    def test_password_reset_flow(self, api_client, tenant_user):
        from apps.accounts.models import EmailOTP
        from apps.accounts.otp import create_otp

        # Step 1: request
        resp = api_client.post(
            "/api/v1/auth/password-reset",
            {"email": tenant_user.email},
            format="json",
        )
        assert resp.status_code == 200

        # Step 2: confirm
        otp = create_otp(tenant_user.email, EmailOTP.PURPOSE_RESET)
        resp = api_client.post(
            "/api/v1/auth/password-reset/confirm",
            {"email": tenant_user.email, "code": otp.code, "new_password": "NewPass@456"},
            format="json",
        )
        assert resp.status_code == 200

        # Verify new password works
        tenant_user.refresh_from_db()
        assert tenant_user.check_password("NewPass@456")


@pytest.mark.django_db
class TestUserMe:
    def test_get_me(self, tenant_client, tenant_user):
        resp = tenant_client.get("/api/v1/users/me")
        assert resp.status_code == 200
        assert resp.data["email"] == tenant_user.email

    def test_patch_me(self, tenant_client, tenant_user):
        resp = tenant_client.patch("/api/v1/users/me", {"full_name": "Updated Name"}, format="json")
        assert resp.status_code == 200
        assert resp.data["full_name"] == "Updated Name"

    def test_unauthenticated(self, api_client):
        resp = api_client.get("/api/v1/users/me")
        assert resp.status_code == 401
