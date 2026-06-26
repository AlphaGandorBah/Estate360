"""Extended moderation tests — fraud report submit, admin list, admin decision."""
import pytest


@pytest.fixture
def open_report(db, tenant_user, approved_listing):
    from apps.moderation.models import FraudReport
    return FraudReport.objects.create(
        reporter=tenant_user,
        listing=approved_listing,
        reason="fake_listing",
        description="This listing looks fake to me.",
    )


@pytest.mark.django_db
class TestFraudReportSubmit:
    def test_submit_report_against_listing(self, tenant_client, approved_listing):
        resp = tenant_client.post(
            "/api/v1/reports/",
            {
                "listing_id": approved_listing.pk,
                "reason": "fake_listing",
                "description": "This looks fake.",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["reason"] == "fake_listing"

    def test_submit_report_requires_auth(self, api_client, approved_listing):
        resp = api_client.post(
            "/api/v1/reports/",
            {
                "listing_id": approved_listing.pk,
                "reason": "scam",
                "description": "Scammer alert.",
            },
            format="json",
        )
        assert resp.status_code == 401

    def test_submit_report_invalid_reason(self, tenant_client, approved_listing):
        resp = tenant_client.post(
            "/api/v1/reports/",
            {
                "listing_id": approved_listing.pk,
                "reason": "bad_vibes",
                "description": "Just don't like it.",
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_submit_report_missing_description(self, tenant_client, approved_listing):
        resp = tenant_client.post(
            "/api/v1/reports/",
            {
                "listing_id": approved_listing.pk,
                "reason": "scam",
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_submit_report_with_user_id(self, tenant_client, verified_landlord):
        resp = tenant_client.post(
            "/api/v1/reports/",
            {
                "reported_user_id": str(verified_landlord.pk),
                "reason": "misleading",
                "description": "Misleading profile.",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_submit_report_with_nonexistent_listing(self, tenant_client):
        resp = tenant_client.post(
            "/api/v1/reports/",
            {
                "listing_id": 99999,
                "reason": "scam",
                "description": "Suspicious listing.",
            },
            format="json",
        )
        # Should still create (listing ref just null out)
        assert resp.status_code == 201


@pytest.mark.django_db
class TestAdminReportList:
    def test_admin_sees_open_reports(self, admin_client, open_report):
        resp = admin_client.get("/api/v1/admin/reports")
        assert resp.status_code == 200
        ids = [r["id"] for r in resp.data["results"]]
        assert open_report.pk in ids

    def test_non_admin_cannot_view(self, tenant_client):
        resp = tenant_client.get("/api/v1/admin/reports")
        assert resp.status_code == 403

    def test_resolved_reports_not_in_list(self, admin_client, open_report):
        from apps.moderation.models import FraudReport
        open_report.status = FraudReport.STATUS_RESOLVED
        open_report.save()
        resp = admin_client.get("/api/v1/admin/reports")
        ids = [r["id"] for r in resp.data["results"]]
        assert open_report.pk not in ids


@pytest.mark.django_db
class TestAdminReportDecision:
    def test_resolve_report(self, admin_client, admin_user, open_report):
        resp = admin_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "resolved", "notes": "Confirmed fraud."},
            format="json",
        )
        assert resp.status_code == 200
        open_report.refresh_from_db()
        assert open_report.status == "resolved"
        assert open_report.handled_by == admin_user

    def test_dismiss_report(self, admin_client, open_report):
        resp = admin_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "dismissed", "notes": "Not enough evidence."},
            format="json",
        )
        assert resp.status_code == 200
        open_report.refresh_from_db()
        assert open_report.status == "dismissed"

    def test_decision_not_found(self, admin_client):
        resp = admin_client.post(
            "/api/v1/admin/reports/99999/resolve",
            {"decision": "resolved"},
            format="json",
        )
        assert resp.status_code == 404

    def test_non_admin_cannot_decide(self, tenant_client, open_report):
        resp = tenant_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "resolved"},
            format="json",
        )
        assert resp.status_code == 403

    def test_invalid_decision_value(self, admin_client, open_report):
        resp = admin_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "ignored"},
            format="json",
        )
        assert resp.status_code == 400

    def test_remove_listing_action_archives_listing(self, admin_client, admin_user, open_report, approved_listing):
        from apps.common.models import AdminActionLog
        resp = admin_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "resolved", "action": "remove_listing", "notes": "Confirmed fake."},
            format="json",
        )
        assert resp.status_code == 200
        approved_listing.refresh_from_db()
        assert approved_listing.status == "archived"

        entry = AdminActionLog.objects.latest("created_at")
        assert entry.action == AdminActionLog.ACTION_DELETE_LISTING
        assert entry.admin_id == admin_user.id
        assert entry.target_listing_id == approved_listing.id

    def test_remove_listing_action_without_listing_rejected(self, admin_client, tenant_user, verified_landlord):
        from apps.moderation.models import FraudReport
        report = FraudReport.objects.create(
            reporter=tenant_user, reported_user=verified_landlord,
            reason="scam", description="Scammed me in chat.",
        )
        resp = admin_client.post(
            f"/api/v1/admin/reports/{report.pk}/resolve",
            {"decision": "resolved", "action": "remove_listing"},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "no_listing"

    def test_warn_action_notifies_reported_user(self, admin_client, admin_user, tenant_user, verified_landlord):
        from apps.moderation.models import FraudReport
        from apps.notifications.models import Notification
        from apps.common.models import AdminActionLog
        report = FraudReport.objects.create(
            reporter=tenant_user, reported_user=verified_landlord,
            reason="scam", description="Scammed me in chat.",
        )
        resp = admin_client.post(
            f"/api/v1/admin/reports/{report.pk}/resolve",
            {"decision": "resolved", "action": "warn", "notes": "Be careful next time."},
            format="json",
        )
        assert resp.status_code == 200
        notif = Notification.objects.filter(user=verified_landlord, type=Notification.TYPE_MODERATION_WARNING).latest("created_at")
        assert "Be careful" in notif.payload["message"]

        entry = AdminActionLog.objects.latest("created_at")
        assert entry.action == AdminActionLog.ACTION_WARN_USER
        assert entry.target_user_id == verified_landlord.id

    def test_warn_action_falls_back_to_listing_owner(self, admin_client, open_report, verified_landlord):
        from apps.notifications.models import Notification
        resp = admin_client.post(
            f"/api/v1/admin/reports/{open_report.pk}/resolve",
            {"decision": "resolved", "action": "warn"},
            format="json",
        )
        assert resp.status_code == 200
        assert Notification.objects.filter(user=verified_landlord, type=Notification.TYPE_MODERATION_WARNING).exists()

    def test_warn_action_without_target_rejected(self, admin_client, tenant_user):
        from apps.moderation.models import FraudReport
        report = FraudReport.objects.create(
            reporter=tenant_user, reason="other", description="General concern, no specific target.",
        )
        resp = admin_client.post(
            f"/api/v1/admin/reports/{report.pk}/resolve",
            {"decision": "resolved", "action": "warn"},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "no_target"


@pytest.mark.django_db
class TestAdminReportListStatusFilter:
    def test_resolved_tab(self, admin_client, open_report):
        from apps.moderation.models import FraudReport
        open_report.status = FraudReport.STATUS_RESOLVED
        open_report.save()
        resp = admin_client.get("/api/v1/admin/reports/?status=resolved")
        ids = [r["id"] for r in resp.data["results"]]
        assert open_report.pk in ids

    def test_dismissed_tab_excludes_open(self, admin_client, open_report):
        resp = admin_client.get("/api/v1/admin/reports/?status=dismissed")
        ids = [r["id"] for r in resp.data["results"]]
        assert open_report.pk not in ids

    def test_invalid_status_rejected(self, admin_client):
        resp = admin_client.get("/api/v1/admin/reports/?status=bogus")
        assert resp.status_code == 400
