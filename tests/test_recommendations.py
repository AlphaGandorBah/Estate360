"""Tests for recommendations: active user and cold-start."""
import pytest
from apps.listings.models import Listing, ListingStatus, UserInteraction


@pytest.mark.django_db
class TestRecommendations:
    url = "/api/v1/recommendations/"

    def test_cold_start_returns_recent_approved(self, tenant_client, approved_listing):
        resp = tenant_client.get(self.url)
        assert resp.status_code == 200
        assert isinstance(resp.data, list)

    def test_cold_start_with_preferences(self, tenant_client, tenant_user, approved_listing):
        from apps.listings.models import SearchPreference
        SearchPreference.objects.create(
            tenant=tenant_user,
            preferred_areas=["aberdeen"],
        )
        resp = tenant_client.get(self.url)
        assert resp.status_code == 200
        for item in resp.data:
            assert item["location_area"] == "aberdeen"

    def test_active_user_recommendations(self, tenant_client, tenant_user, approved_listing):
        # Create interaction
        UserInteraction.objects.create(
            user=tenant_user,
            listing=approved_listing,
            event_type=UserInteraction.EVENT_SAVE,
        )
        resp = tenant_client.get(self.url)
        assert resp.status_code == 200
        assert isinstance(resp.data, list)

    def test_requires_tenant(self, landlord_client):
        resp = landlord_client.get(self.url)
        assert resp.status_code == 403
