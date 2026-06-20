"""Extended recommendations tests — model build, cold start, preferences."""
import pytest


@pytest.fixture
def two_approved_listings(db, verified_landlord):
    from apps.listings.models import Listing, ListingStatus
    l1 = Listing.objects.create(
        owner=verified_landlord, title="Aberdeen Flat",
        description="Great flat near the beach in Aberdeen.",
        property_type="apartment", bedrooms=2, bathrooms=1,
        price_annual=8_000_000, currency="SLE", location_area="aberdeen",
        status=ListingStatus.APPROVED,
    )
    l2 = Listing.objects.create(
        owner=verified_landlord, title="Lumley Studio",
        description="Cosy studio in Lumley with AC and parking.",
        property_type="studio", bedrooms=0, bathrooms=1,
        price_annual=4_000_000, currency="SLE", location_area="lumley",
        status=ListingStatus.APPROVED,
    )
    return [l1, l2]


@pytest.mark.django_db
class TestRecommenderModel:
    def test_build_model_with_listings(self, two_approved_listings):
        from apps.recommendations.model import build_model
        model = build_model()
        assert "vectorizer" in model
        assert "matrix" in model
        assert len(model["listing_ids"]) == 2

    def test_build_model_no_listings_returns_empty(self, db):
        from apps.recommendations.model import build_model
        model = build_model()
        assert model == {}

    def test_load_model_no_file_returns_none(self, db, tmp_path, settings):
        settings.RECOMMENDER_MODEL_DIR = str(tmp_path)
        from apps.recommendations.model import load_model
        result = load_model()
        assert result is None

    def test_load_model_after_build(self, two_approved_listings, tmp_path, settings):
        settings.RECOMMENDER_MODEL_DIR = str(tmp_path)
        from apps.recommendations.model import build_model, load_model
        build_model()
        loaded = load_model()
        assert loaded is not None
        assert "vectorizer" in loaded

    def test_listing_text_helper(self, two_approved_listings):
        from apps.recommendations.model import _listing_text
        listing = two_approved_listings[0]
        text = _listing_text(listing)
        assert "aberdeen" in text.lower()
        assert "apartment" in text.lower()


@pytest.mark.django_db
class TestColdStart:
    def test_cold_start_returns_approved_listings(self, tenant_user, two_approved_listings):
        from apps.recommendations.model import cold_start_ids
        ids = cold_start_ids(tenant_user)
        assert len(ids) >= 2
        for lid in ids:
            assert lid in [l.pk for l in two_approved_listings]

    def test_cold_start_with_preference_filters(self, tenant_user, two_approved_listings):
        from apps.listings.models import SearchPreference
        from apps.recommendations.model import cold_start_ids
        SearchPreference.objects.create(
            tenant=tenant_user,
            preferred_areas=["lumley"],
            min_price=1_000_000,
            max_price=10_000_000,
        )
        ids = cold_start_ids(tenant_user)
        # Should only include Lumley listing
        assert len(ids) == 1

    def test_cold_start_with_bedroom_filter(self, tenant_user, two_approved_listings):
        from apps.listings.models import SearchPreference
        from apps.recommendations.model import cold_start_ids
        SearchPreference.objects.create(
            tenant=tenant_user,
            min_bedrooms=2,
        )
        ids = cold_start_ids(tenant_user)
        # Only l1 has 2 bedrooms
        assert len(ids) == 1
        assert ids[0] == two_approved_listings[0].pk


@pytest.mark.django_db
class TestScoreForUser:
    def test_no_interactions_returns_empty(self, tenant_user, two_approved_listings, tmp_path, settings):
        settings.RECOMMENDER_MODEL_DIR = str(tmp_path)
        from apps.recommendations.model import build_model, score_for_user
        model = build_model()
        result = score_for_user(tenant_user, model)
        assert result == []

    def test_with_save_interaction_scores_listings(
        self, tenant_user, two_approved_listings, tmp_path, settings
    ):
        settings.RECOMMENDER_MODEL_DIR = str(tmp_path)
        from apps.listings.models import UserInteraction
        from apps.recommendations.model import build_model, score_for_user
        UserInteraction.objects.create(
            user=tenant_user,
            listing=two_approved_listings[0],
            event_type=UserInteraction.EVENT_SAVE,
        )
        model = build_model()
        result = score_for_user(tenant_user, model)
        assert isinstance(result, list)


@pytest.mark.django_db
class TestPreferenceView:
    def test_get_no_preference_returns_empty(self, tenant_client):
        resp = tenant_client.get("/api/v1/preferences/me")
        assert resp.status_code == 200
        assert resp.data == {}

    def test_put_creates_preference(self, tenant_client):
        resp = tenant_client.put(
            "/api/v1/preferences/set",
            {
                "preferred_areas": ["aberdeen", "lumley"],
                "min_price": 1_000_000,
                "max_price": 20_000_000,
                "min_bedrooms": 1,
                "property_types": ["apartment"],
            },
            format="json",
        )
        assert resp.status_code == 200
        assert "aberdeen" in resp.data["preferred_areas"]

    def test_put_updates_preference(self, tenant_client):
        tenant_client.put(
            "/api/v1/preferences/set",
            {"preferred_areas": ["aberdeen"], "property_types": []},
            format="json",
        )
        resp = tenant_client.put(
            "/api/v1/preferences/set",
            {"preferred_areas": ["lumley"], "property_types": ["studio"]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["preferred_areas"] == ["lumley"]

    def test_landlord_cannot_access_preferences(self, landlord_client):
        resp = landlord_client.get("/api/v1/preferences/me")
        assert resp.status_code == 403

    def test_get_after_put_returns_saved_data(self, tenant_client):
        tenant_client.put(
            "/api/v1/preferences/set",
            {"preferred_areas": ["goderich"], "property_types": ["house"]},
            format="json",
        )
        resp = tenant_client.get("/api/v1/preferences/me")
        assert resp.status_code == 200
        assert "goderich" in resp.data["preferred_areas"]


@pytest.mark.django_db
class TestRecommendationsView:
    def test_cold_start_for_new_user(self, tenant_client, two_approved_listings):
        resp = tenant_client.get("/api/v1/recommendations/")
        assert resp.status_code == 200
        assert isinstance(resp.data, list)

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/v1/recommendations/")
        assert resp.status_code == 401

    def test_landlord_cannot_access(self, landlord_client):
        resp = landlord_client.get("/api/v1/recommendations/")
        assert resp.status_code == 403
