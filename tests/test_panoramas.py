"""Tests for panorama pipeline functions and API views."""
import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image


# ---------------------------------------------------------------------------
# Pipeline unit tests (no DB needed)
# ---------------------------------------------------------------------------

class TestDetectProjection:
    def test_equirectangular_exact(self):
        from apps.panoramas.pipeline import detect_projection
        assert detect_projection(4000, 2000) == "equirectangular"

    def test_cylindrical_exact(self):
        from apps.panoramas.pipeline import detect_projection
        assert detect_projection(4000, 1000) == "cylindrical"

    def test_equirectangular_near(self):
        from apps.panoramas.pipeline import detect_projection
        # ratio 2.05 — within 0.1 of 2.0
        assert detect_projection(2050, 1000) == "equirectangular"

    def test_cylindrical_near(self):
        from apps.panoramas.pipeline import detect_projection
        # ratio 4.05 — within 0.1 of 4.0
        assert detect_projection(4050, 1000) == "cylindrical"

    def test_fallback_closer_to_equirectangular(self):
        from apps.panoramas.pipeline import detect_projection
        # ratio 2.5 — closer to 2 than 4
        assert detect_projection(2500, 1000) == "equirectangular"

    def test_fallback_closer_to_cylindrical(self):
        from apps.panoramas.pipeline import detect_projection
        # ratio 3.5 — closer to 4 than 2
        assert detect_projection(3500, 1000) == "cylindrical"


def _make_jpeg(width: int = 4000, height: int = 2000) -> io.BytesIO:
    img = Image.new("RGB", (width, height), color=(100, 149, 237))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


def _make_png(width: int = 4000, height: int = 2000) -> io.BytesIO:
    img = Image.new("RGB", (width, height), color=(100, 149, 237))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


class TestStripExif:
    def test_jpeg_strip(self):
        from apps.panoramas.pipeline import strip_exif
        buf = _make_jpeg()
        result = strip_exif(buf)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_png_passthrough(self):
        from apps.panoramas.pipeline import strip_exif
        buf = _make_png()
        result = strip_exif(buf)
        assert isinstance(result, bytes)
        assert len(result) > 0


class TestGenerateThumbnail:
    def test_produces_jpeg_bytes(self):
        from apps.panoramas.pipeline import generate_thumbnail
        buf = _make_jpeg()
        thumb = generate_thumbnail(buf, size=(400, 200))
        assert isinstance(thumb, bytes)
        # Check it's a valid JPEG
        reopened = Image.open(io.BytesIO(thumb))
        assert reopened.format == "JPEG"

    def test_respects_size_constraint(self):
        from apps.panoramas.pipeline import generate_thumbnail
        buf = _make_jpeg(4000, 2000)
        thumb = generate_thumbnail(buf, size=(800, 400))
        img = Image.open(io.BytesIO(thumb))
        assert img.width <= 800
        assert img.height <= 400

    def test_preview_larger_than_thumbnail(self):
        from apps.panoramas.pipeline import generate_thumbnail
        buf = _make_jpeg()
        thumb_bytes = generate_thumbnail(buf, size=(800, 400))
        buf.seek(0)
        preview_bytes = generate_thumbnail(buf, size=(1920, 960))
        # Preview should be at least as large as thumbnail
        assert len(preview_bytes) >= len(thumb_bytes)


class TestValidateImage:
    def test_valid_jpeg(self):
        from apps.panoramas.pipeline import validate_image
        buf = _make_jpeg(4000, 2000)
        w, h, proj = validate_image(buf, "image/jpeg", buf.getbuffer().nbytes)
        assert w == 4000
        assert h == 2000
        assert proj == "equirectangular"

    def test_invalid_mime_raises(self):
        from apps.panoramas.pipeline import validate_image
        buf = _make_jpeg()
        with pytest.raises(ValueError, match="not allowed"):
            validate_image(buf, "application/pdf", 1000)

    def test_oversized_raises(self):
        from apps.panoramas.pipeline import validate_image
        from django.conf import settings
        buf = _make_jpeg()
        with pytest.raises(ValueError, match="exceeds"):
            validate_image(buf, "image/jpeg", settings.PANORAMA_MAX_SIZE_BYTES + 1)

    def test_too_narrow_raises(self):
        from apps.panoramas.pipeline import validate_image
        from django.conf import settings
        buf = _make_jpeg(100, 50)
        with pytest.raises(ValueError, match="width"):
            validate_image(buf, "image/jpeg", buf.getbuffer().nbytes)


# ---------------------------------------------------------------------------
# API view tests (require DB)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPanoramaListCreate:
    def _make_listing(self, landlord):
        from apps.listings.models import Listing, ListingStatus
        return Listing.objects.create(
            owner=landlord,
            title="Test",
            description="desc",
            property_type="apartment",
            bedrooms=2,
            bathrooms=1,
            price_annual=5_000_000,
            currency="SLE",
            location_area="aberdeen",
            status=ListingStatus.DRAFT,
        )

    def test_list_panoramas_public(self, api_client, approved_listing):
        resp = api_client.get(f"/api/v1/listings/{approved_listing.pk}/panoramas")
        assert resp.status_code == 200

    def test_list_not_found(self, api_client):
        resp = api_client.get("/api/v1/listings/99999/panoramas")
        assert resp.status_code == 404

    def test_upload_requires_auth(self, api_client, approved_listing):
        resp = api_client.post(f"/api/v1/listings/{approved_listing.pk}/panoramas", {})
        assert resp.status_code == 401

    def test_upload_wrong_owner(self, tenant_client, approved_listing):
        buf = _make_jpeg()
        buf.name = "test.jpg"
        resp = tenant_client.post(
            f"/api/v1/listings/{approved_listing.pk}/panoramas",
            {"image": buf, "room_label": "Living Room"},
            format="multipart",
        )
        assert resp.status_code == 403

    @patch("apps.panoramas.views.upload_file")
    @patch("apps.panoramas.views.process_panorama_task")
    def test_upload_success(self, mock_task, mock_upload, landlord_client, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Pano Listing",
            description="desc",
            property_type="apartment",
            bedrooms=1,
            bathrooms=1,
            price_annual=3_000_000,
            currency="SLE",
            location_area="lumley",
            status=ListingStatus.DRAFT,
        )
        buf = _make_jpeg()
        from django.core.files.uploadedfile import SimpleUploadedFile
        uploaded = SimpleUploadedFile("test.jpg", buf.read(), content_type="image/jpeg")

        resp = landlord_client.post(
            f"/api/v1/listings/{listing.pk}/panoramas",
            {"image": uploaded, "room_label": "Living Room", "ordering": "1"},
            format="multipart",
        )
        assert resp.status_code == 202
        assert resp.data["status"] == "pending"
        assert mock_upload.called
        assert mock_task.apply_async.called

    @patch("apps.panoramas.views.upload_file")
    def test_upload_missing_image(self, mock_upload, landlord_client, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Another",
            description="desc",
            property_type="house",
            bedrooms=3,
            bathrooms=2,
            price_annual=6_000_000,
            currency="SLE",
            location_area="goderich",
            status=ListingStatus.DRAFT,
        )
        resp = landlord_client.post(
            f"/api/v1/listings/{listing.pk}/panoramas",
            {"room_label": "Kitchen"},
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "missing_file"

    @patch("apps.panoramas.views.upload_file")
    def test_upload_missing_room_label(self, mock_upload, landlord_client, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Another 2",
            description="desc",
            property_type="house",
            bedrooms=3,
            bathrooms=2,
            price_annual=6_000_000,
            currency="SLE",
            location_area="goderich",
            status=ListingStatus.DRAFT,
        )
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = _make_jpeg()
        uploaded = SimpleUploadedFile("x.jpg", buf.read(), content_type="image/jpeg")
        resp = landlord_client.post(
            f"/api/v1/listings/{listing.pk}/panoramas",
            {"image": uploaded},
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "missing_label"


@pytest.mark.django_db
class TestPanoramaDetail:
    def _make_panorama(self, listing):
        from apps.panoramas.models import Panorama
        return Panorama.objects.create(
            listing=listing,
            room_label="Living Room",
            status=Panorama.STATUS_READY,
            projection="equirectangular",
        )

    def test_get_detail_public(self, api_client, approved_listing):
        p = self._make_panorama(approved_listing)
        resp = api_client.get(f"/api/v1/panoramas/{p.pk}")
        assert resp.status_code == 200
        assert resp.data["id"] == p.pk

    def test_get_not_found(self, api_client):
        resp = api_client.get("/api/v1/panoramas/99999")
        assert resp.status_code == 404

    def test_delete_success(self, landlord_client, approved_listing):
        p = self._make_panorama(approved_listing)
        resp = landlord_client.delete(f"/api/v1/panoramas/{p.pk}")
        assert resp.status_code == 204

    def test_delete_wrong_owner(self, tenant_client, approved_listing):
        p = self._make_panorama(approved_listing)
        resp = tenant_client.delete(f"/api/v1/panoramas/{p.pk}")
        assert resp.status_code == 403

    def test_delete_not_found(self, landlord_client):
        resp = landlord_client.delete("/api/v1/panoramas/99999")
        assert resp.status_code == 404
