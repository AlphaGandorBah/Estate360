"""Tests for user profile and avatar endpoints."""
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile


def _jpg_file(name="avatar.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8\xff fake jpeg", content_type="image/jpeg")


@pytest.mark.django_db
class TestMeView:
    def test_profile_includes_avatar_url(self, tenant_client, tenant_user):
        resp = tenant_client.get("/api/v1/users/me")
        assert resp.status_code == 200
        assert resp.data["avatar_url"] is None


@pytest.mark.django_db
class TestAvatarUploadView:
    url = "/api/v1/users/me/avatar"

    def test_requires_auth(self, api_client):
        resp = api_client.post(self.url, {"avatar": _jpg_file()}, format="multipart")
        assert resp.status_code == 401

    def test_missing_file_returns_400(self, tenant_client):
        resp = tenant_client.post(self.url, {}, format="multipart")
        assert resp.status_code == 400
        assert resp.data["code"] == "missing_file"

    def test_rejects_disallowed_type(self, tenant_client):
        bad_file = SimpleUploadedFile("doc.pdf", b"%PDF-1.4", content_type="application/pdf")
        resp = tenant_client.post(self.url, {"avatar": bad_file}, format="multipart")
        assert resp.status_code == 400

    @patch("apps.accounts.views.user_views.upload_file")
    def test_upload_sets_avatar_key(self, mock_upload, tenant_client, tenant_user):
        resp = tenant_client.post(self.url, {"avatar": _jpg_file()}, format="multipart")
        assert resp.status_code == 200
        assert mock_upload.called
        tenant_user.refresh_from_db()
        assert tenant_user.avatar_key.startswith(f"avatars/{tenant_user.id}/")

    @patch("apps.accounts.views.user_views.delete_file")
    @patch("apps.accounts.views.user_views.upload_file")
    def test_reupload_deletes_old_key(self, mock_upload, mock_delete, tenant_client, tenant_user):
        tenant_user.avatar_key = "avatars/old/key.jpg"
        tenant_user.save(update_fields=["avatar_key"])

        resp = tenant_client.post(self.url, {"avatar": _jpg_file()}, format="multipart")
        assert resp.status_code == 200
        mock_delete.assert_called_once_with("avatars/old/key.jpg")

    @patch("apps.accounts.views.user_views.delete_file")
    def test_delete_clears_avatar_key(self, mock_delete, tenant_client, tenant_user):
        tenant_user.avatar_key = "avatars/old/key.jpg"
        tenant_user.save(update_fields=["avatar_key"])

        resp = tenant_client.delete(self.url)
        assert resp.status_code == 200
        assert resp.data["avatar_url"] is None
        mock_delete.assert_called_once_with("avatars/old/key.jpg")
        tenant_user.refresh_from_db()
        assert tenant_user.avatar_key == ""

    def test_delete_without_avatar_is_noop(self, tenant_client):
        resp = tenant_client.delete(self.url)
        assert resp.status_code == 200
        assert resp.data["avatar_url"] is None
