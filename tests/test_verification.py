"""Tests for identity verification flows across public account roles."""
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

    def test_tenant_can_access_identity_verification(self, tenant_client):
        resp = tenant_client.get("/api/v1/verification/me")
        assert resp.status_code == 404

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

    def test_tenant_submission_reaches_file_validation(self, tenant_client):
        resp = tenant_client.post(
            "/api/v1/verification/",
            {"document_type": "national_id"},
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "missing_files"

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
    @patch("apps.accounts.views.verification_views.upload_file")
    def test_successful_submission(self, mock_upload, mock_scan, landlord_client, verified_landlord):
        from apps.accounts.models import LandlordVerification

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
        verification = LandlordVerification.objects.get(user=verified_landlord)
        assert verification.document_front_key.startswith("verifications/front/")
        assert verification.selfie_key.startswith("verifications/selfie/")
        assert mock_upload.call_count == 2
        assert mock_upload.call_args_list[0].kwargs["content_type"] == "application/pdf"
        assert mock_upload.call_args_list[1].kwargs["content_type"] == "image/jpeg"

    @patch("apps.accounts.views.verification_views.scan_file")
    @patch("apps.accounts.views.verification_views.upload_file")
    def test_detects_file_type_when_phone_sends_generic_mime(
        self, mock_upload, mock_scan, landlord_client
    ):
        front = SimpleUploadedFile(
            "front.pdf", b"%PDF-1.4 phone upload", content_type="application/octet-stream"
        )
        selfie = SimpleUploadedFile(
            "selfie.jpg", b"\xff\xd8\xff phone photo", content_type="application/octet-stream"
        )

        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": front,
                "selfie": selfie,
            },
            format="multipart",
        )

        assert resp.status_code == 201
        assert [call.kwargs["content_type"] for call in mock_upload.call_args_list] == [
            "application/pdf",
            "image/jpeg",
        ]

    @patch("apps.accounts.views.verification_views.scan_file")
    @patch("apps.accounts.views.verification_views.upload_file")
    def test_invalid_selfie_does_not_upload_any_document(
        self, mock_upload, mock_scan, landlord_client
    ):
        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": _pdf_file("front.pdf"),
                "selfie": _pdf_file("not-a-selfie.pdf"),
            },
            format="multipart",
        )

        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_verification_file"
        assert resp.data["detail"] == "The selfie must be a valid JPG or PNG image."
        mock_upload.assert_not_called()

    @patch("apps.accounts.views.verification_views.scan_file")
    @patch("apps.accounts.views.verification_views.delete_file")
    @patch("apps.accounts.views.verification_views.upload_file")
    def test_partial_storage_failure_removes_uploaded_files_and_returns_503(
        self, mock_upload, mock_delete, mock_scan, landlord_client, verified_landlord
    ):
        from apps.accounts.models import LandlordVerification
        from apps.common.storage import ObjectStorageUnavailableError

        mock_upload.side_effect = [
            None,
            ObjectStorageUnavailableError("MinIO unavailable"),
        ]

        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": _pdf_file("front.pdf"),
                "selfie": _jpg_file("selfie.jpg"),
            },
            format="multipart",
        )

        assert resp.status_code == 503
        assert resp.data["code"] == "storage_unavailable"
        assert not LandlordVerification.objects.filter(user=verified_landlord).exists()
        mock_delete.assert_called_once()
        assert mock_delete.call_args.args[0].startswith("verifications/front/")

    @patch("apps.accounts.views.verification_views.scan_file")
    @patch("apps.accounts.views.verification_views.delete_file")
    @patch("apps.accounts.views.verification_views.upload_file")
    def test_rejected_resubmission_reuses_row_and_cleans_up_old_objects(
        self, mock_upload, mock_delete, mock_scan, landlord_client, verified_landlord
    ):
        from apps.accounts.models import LandlordVerification

        verification = LandlordVerification.objects.create(
            user=verified_landlord,
            document_type=LandlordVerification.DOC_PASSPORT,
            document_front_key="verifications/front/old.jpg",
            document_back_key="verifications/back/old.jpg",
            selfie_key="verifications/selfie/old.jpg",
            status=LandlordVerification.STATUS_REJECTED,
            notes="Too blurry",
        )

        resp = landlord_client.post(
            "/api/v1/verification/",
            {
                "document_type": "national_id",
                "document_front": _pdf_file("new-front.pdf"),
                "selfie": _jpg_file("new-selfie.jpg"),
            },
            format="multipart",
        )

        assert resp.status_code == 201
        verification.refresh_from_db()
        assert verification.status == LandlordVerification.STATUS_PENDING
        assert verification.notes == ""
        assert verification.document_type == LandlordVerification.DOC_NATIONAL_ID
        assert verification.document_front_key.startswith("verifications/front/")
        assert verification.selfie_key.startswith("verifications/selfie/")
        assert [call.args[0] for call in mock_delete.call_args_list] == [
            "verifications/front/old.jpg",
            "verifications/back/old.jpg",
            "verifications/selfie/old.jpg",
        ]


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
        resp = admin_client.get("/api/v1/admin/verifications/")
        assert resp.status_code == 200
        assert len(resp.data) >= 1

    def test_non_admin_cannot_list(self, landlord_client):
        resp = landlord_client.get("/api/v1/admin/verifications/")
        assert resp.status_code == 403

    def test_status_filter(self, admin_client, verified_landlord, tenant_user):
        from apps.accounts.models import LandlordVerification
        pending = LandlordVerification.objects.create(
            user=verified_landlord, document_type="national_id",
            document_front_key="k1", selfie_key="k2", status=LandlordVerification.STATUS_PENDING,
        )
        approved = LandlordVerification.objects.create(
            user=tenant_user, document_type="passport",
            document_front_key="k1", selfie_key="k2", status=LandlordVerification.STATUS_APPROVED,
        )

        resp = admin_client.get("/api/v1/admin/verifications/")
        ids = [v["id"] for v in resp.data["results"]]
        assert pending.pk in ids and approved.pk not in ids

        resp = admin_client.get("/api/v1/admin/verifications/?status=approved")
        ids = [v["id"] for v in resp.data["results"]]
        assert approved.pk in ids and pending.pk not in ids

        resp = admin_client.get("/api/v1/admin/verifications/?status=bogus")
        assert resp.status_code == 400

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
        verified_landlord.refresh_from_db()
        assert verified_landlord.is_verified is False

    def test_admin_cannot_change_a_completed_decision(
        self, admin_client, verified_landlord
    ):
        from apps.accounts.models import LandlordVerification

        v = LandlordVerification.objects.create(
            user=verified_landlord,
            document_type="national_id",
            document_front_key="k1",
            selfie_key="k2",
            status=LandlordVerification.STATUS_APPROVED,
        )

        resp = admin_client.post(
            f"/api/v1/admin/verifications/{v.pk}/decision",
            {"decision": "rejected", "notes": "Changed later"},
            format="json",
        )

        assert resp.status_code == 400
        assert resp.data["code"] == "already_decided"
        v.refresh_from_db()
        assert v.status == LandlordVerification.STATUS_APPROVED

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
