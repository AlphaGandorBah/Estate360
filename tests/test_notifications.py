"""Tests for notifications utility, views, and model."""
import pytest


@pytest.mark.django_db
class TestCreateNotification:
    def test_creates_notification_record(self, tenant_user):
        from apps.notifications.utils import create_notification
        notif = create_notification(
            user=tenant_user,
            notif_type="test_event",
            payload={"key": "value"},
        )
        assert notif.pk is not None
        assert notif.type == "test_event"
        assert notif.payload == {"key": "value"}
        assert notif.user == tenant_user

    def test_channel_layer_failure_is_graceful(self, tenant_user):
        from unittest.mock import patch
        from apps.notifications.utils import create_notification
        with patch("apps.notifications.utils.get_channel_layer", return_value=None):
            notif = create_notification(
                user=tenant_user,
                notif_type="test_event",
                payload={},
            )
        assert notif.pk is not None
        assert not notif.is_sent


@pytest.mark.django_db
class TestNotificationListView:
    def test_list_empty(self, tenant_client):
        resp = tenant_client.get("/api/v1/notifications/")
        assert resp.status_code == 200
        assert resp.data["results"] == []

    def test_list_returns_own_notifications(self, tenant_client, tenant_user, verified_landlord):
        from apps.notifications.models import Notification
        Notification.objects.create(user=tenant_user, type="test", payload={})
        Notification.objects.create(user=tenant_user, type="test2", payload={})
        Notification.objects.create(user=verified_landlord, type="other", payload={})
        resp = tenant_client.get("/api/v1/notifications/")
        assert resp.status_code == 200
        assert resp.data["count"] == 2

    def test_list_requires_auth(self, api_client):
        resp = api_client.get("/api/v1/notifications/")
        assert resp.status_code == 401


@pytest.mark.django_db
class TestNotificationReadView:
    def test_mark_one_read(self, tenant_client, tenant_user):
        from apps.notifications.models import Notification
        notif = Notification.objects.create(user=tenant_user, type="t", payload={})
        assert not notif.is_read
        resp = tenant_client.post(f"/api/v1/notifications/{notif.pk}/read")
        assert resp.status_code == 200
        notif.refresh_from_db()
        assert notif.is_read

    def test_mark_other_users_notif_returns_404(self, tenant_client, verified_landlord):
        from apps.notifications.models import Notification
        notif = Notification.objects.create(user=verified_landlord, type="t", payload={})
        resp = tenant_client.post(f"/api/v1/notifications/{notif.pk}/read")
        assert resp.status_code == 404

    def test_mark_nonexistent_returns_404(self, tenant_client):
        resp = tenant_client.post("/api/v1/notifications/99999/read")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestNotificationReadAllView:
    def test_mark_all_read(self, tenant_client, tenant_user):
        from apps.notifications.models import Notification
        for _ in range(3):
            Notification.objects.create(user=tenant_user, type="t", payload={})
        resp = tenant_client.post("/api/v1/notifications/read-all")
        assert resp.status_code == 200
        unread = Notification.objects.filter(user=tenant_user, is_read=False).count()
        assert unread == 0

    def test_requires_auth(self, api_client):
        resp = api_client.post("/api/v1/notifications/read-all")
        assert resp.status_code == 401
