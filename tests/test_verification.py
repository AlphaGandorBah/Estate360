"""Tests for landlord identity verification flows."""
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile


def _pdf_file(name="id.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake content", content_type="application/pdf")


def _jpg_file(name="selfie.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8\xff fake jpeg", content_type="image/jpeg")


@pytest.mark.django_db
class TestVerificationMeView:
    def test_no_verification_returns_404(self, landlord_client):
        resp = landlord_client.get("/api/v1/verification/me")
        assert resp.status_code == 404

    def test_tenant_cannot_access(self, tenant_client):
        resp = tenant_client.get("/api/v1/verification/me")
        assert resp.status_code == 403

    def test_returns_own_verification(self, landlord_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="verifications/front/abc.jpg",
            selfie_key="verifications/selfie/xyz.jpg",
        )
        resp = landlord_client.get("/api/v1/verification/me")
        assert resp.status_code == 200
        assert resp.data["document_type"] == "national_id"


@pytest.mark.django_db
class TestVerificationSubmitView:
    def test_missing_files_returns_400(self, landlord_client):
        with patch("apps.accounts.views.verification_views.scan_file"), \
             patch("apps.accounts.views.verification_views.upload_file"):
            resp = landlord_client.post(
                "/api/v1/verification/",
                {"document_type": "national_id"},
                format="multipart",
            )
        assert resp.status_code == 400
        assert resp.data["code"] == "missing_files"

    def test_invalid_document_type_returns_400(self, landlord_client):
        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "unicorn_license",
                "document_front": _pdf_file(),
                "selfie": _jpg_file(),
            },
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_document_type"

    def test_tenant_cannot_submit(self, tenant_client):
        resp = tenant_client.post(
            "/api/v1/verification/",
            {"document_type": "national_id"},
            format="multipart",
        )
        assert resp.status_code == 403

    def test_already_approved_returns_400(self, landlord_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="k1",
            selfie_key="k2",
            status=LandlordVerification.STATUS_APPROVED,
        )
        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": _pdf_file(),
                "selfie": _jpg_file(),
            },
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "already_verified"

    @patch("apps.accounts.views.verification_views.scan_file")
    @patch("apps.accounts.views.verification_views.upload_file", return_value="verifications/front/abc.pdf")
    def test_successful_submission(self, mock_upload, mock_scan, landlord_client, verified_landlord):
        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": _pdf_file("front.pdf"),
                "selfie": _jpg_file("selfie.jpg"),
            },
            format="multipart",
        )
        assert resp.status_code == 201
        assert resp.data["document_type"] == "national_id"
        assert resp.data["status"] == "pending"


@pytest.mark.django_db
class TestAdminVerificationViews:
    def test_admin_can_list_pending(self, admin_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="k1",
            selfie_key="k2",
            status=LandlordVerification.STATUS_PENDING,
        )
        resp = admin_client.get("/api/v1/admin/verifications")
        assert resp.status_code == 200
        assert len(resp.data) >= 1

    def test_non_admin_cannot_list(self, landlord_client):
        resp = landlord_client.get("/api/v1/admin/verifications")
        assert resp.status_code == 403

    def test_admin_approve_decision(self, admin_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        v = LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="passport",
            document_front_key="k1",
            selfie_key="k2",
            status=LandlordVerification.STATUS_PENDING,
        )
        verified_landlord.is_verified = False
        verified_landlord.save()

        resp = admin_client.post(
            f"/api/v1/admin/verifications/{v.pk}/decision",
            {"decision": "approved", "notes": "Looks good"},
            format="json",
        )
        assert resp.status_code == 200
        v.refresh_from_db()
        assert v.status == "approved"
        verified_landlord.refresh_from_db()
        assert verified_landlord.is_verified

    def test_admin_reject_decision(self, admin_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        v = LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="k1",
            selfie_key="k2",
        )
        resp = admin_client.post(
            f"/api/v1/admin/verifications/{v.pk}/decision",
            {"decision": "rejected", "notes": "Blurry photo"},
            format="json",
        )
        assert resp.status_code == 200
        v.refresh_from_db()
        assert v.status == "rejected"

    def test_decision_not_found(self, admin_client):
        resp = admin_client.post(
            "/api/v1/admin/verifications/99999/decision",
            {"decision": "approved"},
            format="json",
        )
        assert resp.status_code == 404

    def test_decision_non_admin_forbidden(self, landlord_client, verified_landlord):
        from apps.accounts.models import LandlordVerification
        v = LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="k1",
            selfie_key="k2",
        )
        resp = landlord_client.post(
            f"/api/v1/admin/verifications/{v.pk}/decision",
            {"decision": "approved"},
            format="json",
        )
        assert resp.status_code == 403
