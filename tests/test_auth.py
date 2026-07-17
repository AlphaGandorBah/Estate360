"""Tests for authentication endpoints."""
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

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
            "confirm_password": "StrongPass@123",
        }
        resp = api_client.post(self.url, data, format="json")
        assert resp.status_code == 201
        assert User.objects.filter(email="newuser@test.com").exists()

    def test_register_legacy_payload_without_confirmation(self, api_client):
        data = {
            "email": "legacy-client@test.com",
            "full_name": "Legacy Client",
            "role": "tenant",
            "password": "StrongPass@123",
        }

        resp = api_client.post(self.url, data, format="json")

        assert resp.status_code == 201
        assert User.objects.filter(email="legacy-client@test.com").exists()

    def test_register_duplicate_email(self, api_client, tenant_user):
        data = {
            "email": tenant_user.email,
            "full_name": "Dup",
            "role": "tenant",
            "password": "StrongPass@123",
            "confirm_password": "StrongPass@123",
        }
        resp = api_client.post(self.url, data, format="json")
        assert resp.status_code == 400

    def test_register_invalid_role(self, api_client):
        data = {
            "email": "x@x.com",
            "full_name": "X",
            "role": "admin",
            "password": "StrongPass@123",
            "confirm_password": "StrongPass@123",
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

        refresh_cookie = resp.cookies[settings.JWT_REFRESH_COOKIE_NAME]
        assert refresh_cookie["secure"] is True
        assert refresh_cookie["httponly"] is True
        assert refresh_cookie["samesite"] == "Lax"

    def test_login_wrong_password(self, api_client, tenant_user):
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "wrong"}, format="json")
        assert resp.status_code == 401

    def test_login_unknown_email(self, api_client):
        resp = api_client.post(self.url, {"email": "nobody@x.com", "password": "pass"}, format="json")
        assert resp.status_code == 401

    def test_login_response_includes_is_restricted(self, api_client, tenant_user):
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "TestPass@123"}, format="json")
        assert resp.status_code == 200
        assert resp.data["user"]["is_restricted"] is False

    def test_banned_account_gets_distinct_error(self, api_client, tenant_user):
        tenant_user.is_active = False
        tenant_user.save(update_fields=["is_active"])
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "TestPass@123"}, format="json")
        assert resp.status_code == 403
        assert resp.data["code"] == "account_banned"

    def test_banned_account_with_wrong_password_still_looks_like_wrong_password(self, api_client, tenant_user):
        tenant_user.is_active = False
        tenant_user.save(update_fields=["is_active"])
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "wrong"}, format="json")
        assert resp.status_code == 401
        assert resp.data["code"] == "invalid_credentials"

    def test_restricted_but_not_banned_logs_in_normally(self, api_client, tenant_user):
        tenant_user.is_restricted = True
        tenant_user.save(update_fields=["is_restricted"])
        resp = api_client.post(self.url, {"email": tenant_user.email, "password": "TestPass@123"}, format="json")
        assert resp.status_code == 200
        assert resp.data["user"]["is_restricted"] is True


@pytest.mark.django_db
class TestRefresh:
    url = "/api/v1/auth/refresh"
    headers = {"HTTP_X_REQUESTED_WITH": "estate360-web"}

    def _login_and_get_cookie(self, api_client, user):
        resp = api_client.post(
            "/api/v1/auth/login", {"email": user.email, "password": "TestPass@123"}, format="json"
        )
        return resp.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    def test_refresh_succeeds_for_active_user(self, api_client, tenant_user):
        cookie = self._login_and_get_cookie(api_client, tenant_user)
        api_client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = cookie
        resp = api_client.post(self.url, **self.headers)
        assert resp.status_code == 200
        assert "access" in resp.data

    def test_refresh_rejected_for_banned_user(self, api_client, tenant_user):
        cookie = self._login_and_get_cookie(api_client, tenant_user)
        tenant_user.is_active = False
        tenant_user.save(update_fields=["is_active"])
        api_client.cookies[settings.JWT_REFRESH_COOKIE_NAME] = cookie
        resp = api_client.post(self.url, **self.headers)
        assert resp.status_code == 403
        assert resp.data["code"] == "account_banned"


@pytest.mark.django_db
class TestVerifyEmail:
    url = "/api/v1/auth/verify-email"

    def test_verify_email_success_does_not_bypass_identity_review(self, api_client, tenant_user):
        from apps.accounts.models import EmailOTP
        from apps.accounts.otp import create_otp
        otp = create_otp(tenant_user.email, EmailOTP.PURPOSE_VERIFY)
        resp = api_client.post(self.url, {"email": tenant_user.email, "code": otp.code}, format="json")
        assert resp.status_code == 200
        tenant_user.refresh_from_db()
        assert not tenant_user.is_verified

    def test_verify_wrong_code(self, api_client, tenant_user):
        from apps.accounts.models import EmailOTP
        from apps.accounts.otp import create_otp
        create_otp(tenant_user.email, EmailOTP.PURPOSE_VERIFY)
        resp = api_client.post(self.url, {"email": tenant_user.email, "code": "000000"}, format="json")
        assert resp.status_code == 400

    def test_verify_expired_otp(self, api_client, tenant_user):
        from datetime import timedelta

        from django.utils import timezone

        from apps.accounts.models import EmailOTP
        from apps.accounts.otp import create_otp
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

        # Step 2: verify the one-time code and obtain a signed reset token
        otp = create_otp(tenant_user.email, EmailOTP.PURPOSE_RESET)
        resp = api_client.post(
            "/api/v1/auth/password-reset/verify-otp",
            {"email": tenant_user.email, "code": otp.code},
            format="json",
        )
        assert resp.status_code == 200
        reset_token = resp.data["reset_token"]

        # Step 3: set and confirm the new password
        resp = api_client.post(
            "/api/v1/auth/password-reset/confirm",
            {
                "email": tenant_user.email,
                "reset_token": reset_token,
                "new_password": "NewPass@456",
                "confirm_password": "NewPass@456",
            },
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
