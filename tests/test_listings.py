"""Tests for listing endpoints."""
import pytest
from apps.listings.models import Listing, ListingStatus


@pytest.mark.django_db
class TestListingList:
    url = "/api/v1/listings/"

    def test_public_list(self, api_client, approved_listing):
        resp = api_client.get(self.url)
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_filter_by_area(self, api_client, approved_listing):
        resp = api_client.get(self.url + "?area=aberdeen")
        assert resp.status_code == 200
        for item in resp.data["results"]:
            assert item["location_area"] == "aberdeen"

    def test_filter_by_min_price(self, api_client, approved_listing):
        resp = api_client.get(self.url + "?min_price=1000000")
        assert resp.status_code == 200

    def test_search_full_text(self, api_client, approved_listing):
        resp = api_client.get(self.url + "?q=Aberdeen")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestListingCreate:
    url = "/api/v1/listings/"

    def test_create_requires_verified_landlord(self, tenant_client):
        resp = tenant_client.post(self.url, {}, format="json")
        assert resp.status_code == 403

    def test_create_listing(self, landlord_client):
        data = {
            "title": "New Apartment",
            "description": "Great place to live in Freetown.",
            "property_type": "apartment",
            "bedrooms": 2,
            "bathrooms": 1,
            "price_annual": 10_000_000,
            "currency": "SLE",
            "location_area": "lumley",
        }
        resp = landlord_client.post(self.url, data, format="json")
        assert resp.status_code == 201
        assert resp.data["status"] == "draft"

    def test_create_idempotent(self, landlord_client):
        data = {
            "title": "Idempotent Listing",
            "description": "Test idempotency.",
            "property_type": "studio",
            "bedrooms": 0,
            "bathrooms": 1,
            "price_annual": 5_000_000,
            "currency": "SLE",
            "location_area": "goderich",
        }
        key = "550e8400-e29b-41d4-a716-446655440000"
        resp1 = landlord_client.post(self.url, data, format="json", HTTP_IDEMPOTENCY_KEY=key)
        resp2 = landlord_client.post(self.url, data, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.data["id"] == resp2.data["id"]


@pytest.mark.django_db
class TestListingSubmit:
    def test_submit_without_panorama_fails(self, landlord_client, verified_landlord):
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Draft",
            description="desc",
            property_type="apartment",
            bedrooms=1,
            bathrooms=1,
            price_annual=5_000_000,
            currency="SLE",
            location_area="aberdeen",
            status=ListingStatus.DRAFT,
        )
        resp = landlord_client.post(f"/api/v1/listings/{listing.pk}/submit")
        assert resp.status_code == 400
        assert resp.data["code"] == "no_panorama"


@pytest.mark.django_db
class TestSaveListing:
    def test_save_and_unsave(self, tenant_client, approved_listing):
        # Save
        resp = tenant_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code in (200, 201)
        # Unsave
        resp = tenant_client.delete(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 204

    def test_save_requires_tenant(self, landlord_client, approved_listing):
        resp = landlord_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 403
