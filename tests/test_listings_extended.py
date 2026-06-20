"""Extended listing tests — admin queue, decisions, save/unsave, saved listings."""
import pytest


@pytest.fixture
def draft_listing(db, verified_landlord):
    from apps.listings.models import Listing, ListingStatus
    return Listing.objects.create(
        owner=verified_landlord,
        title="Draft Apartment",
        description="A nice draft listing.",
        property_type="apartment",
        bedrooms=2,
        bathrooms=1,
        price_annual=8_000_000,
        currency="SLE",
        location_area="lumley",
        status=ListingStatus.DRAFT,
    )


@pytest.fixture
def pending_listing(db, verified_landlord):
    from apps.listings.models import Listing, ListingStatus
    return Listing.objects.create(
        owner=verified_landlord,
        title="Pending House",
        description="Awaiting admin approval.",
        property_type="house",
        bedrooms=3,
        bathrooms=2,
        price_annual=12_000_000,
        currency="SLE",
        location_area="goderich",
        status=ListingStatus.PENDING,
    )


@pytest.mark.django_db
class TestListingViewInteraction:
    def test_authenticated_view_creates_interaction(self, tenant_client, approved_listing):
        from apps.listings.models import UserInteraction
        tenant_client.get(f"/api/v1/listings/{approved_listing.pk}")
        assert UserInteraction.objects.filter(
            listing=approved_listing, event_type=UserInteraction.EVENT_VIEW
        ).exists()

    def test_second_view_within_24h_not_duplicated(self, tenant_client, approved_listing):
        from apps.listings.models import UserInteraction
        tenant_client.get(f"/api/v1/listings/{approved_listing.pk}")
        tenant_client.get(f"/api/v1/listings/{approved_listing.pk}")
        count = UserInteraction.objects.filter(
            listing=approved_listing, event_type=UserInteraction.EVENT_VIEW
        ).count()
        assert count == 1

    def test_unauthenticated_view_no_interaction(self, api_client, approved_listing):
        from apps.listings.models import UserInteraction
        api_client.get(f"/api/v1/listings/{approved_listing.pk}")
        assert not UserInteraction.objects.filter(listing=approved_listing).exists()

    def test_archived_listing_returns_404(self, api_client, approved_listing):
        from apps.listings.models import ListingStatus
        approved_listing.status = ListingStatus.ARCHIVED
        approved_listing.save()
        resp = api_client.get(f"/api/v1/listings/{approved_listing.pk}")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestAdminListingQueue:
    def test_admin_can_see_pending_listings(self, admin_client, pending_listing):
        resp = admin_client.get("/api/v1/admin/listings")
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.data["results"]]
        assert pending_listing.pk in ids

    def test_non_admin_cannot_see_queue(self, landlord_client):
        resp = landlord_client.get("/api/v1/admin/listings")
        assert resp.status_code == 403

    def test_approved_listings_not_in_queue(self, admin_client, approved_listing):
        resp = admin_client.get("/api/v1/admin/listings")
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.data["results"]]
        assert approved_listing.pk not in ids


@pytest.mark.django_db
class TestAdminListingDecision:
    def test_approve_listing(self, admin_client, admin_user, pending_listing):
        resp = admin_client.post(
            f"/api/v1/admin/listings/{pending_listing.pk}/decision",
            {"decision": "approved", "notes": ""},
            format="json",
        )
        assert resp.status_code == 200
        pending_listing.refresh_from_db()
        assert pending_listing.status == "approved"

    def test_reject_listing_with_notes(self, admin_client, pending_listing):
        resp = admin_client.post(
            f"/api/v1/admin/listings/{pending_listing.pk}/decision",
            {"decision": "rejected", "notes": "Photos missing"},
            format="json",
        )
        assert resp.status_code == 200
        pending_listing.refresh_from_db()
        assert pending_listing.status == "rejected"
        assert pending_listing.rejection_notes == "Photos missing"

    def test_decision_not_found(self, admin_client):
        resp = admin_client.post(
            "/api/v1/admin/listings/99999/decision",
            {"decision": "approved"},
            format="json",
        )
        assert resp.status_code == 404

    def test_non_admin_cannot_decide(self, landlord_client, pending_listing):
        resp = landlord_client.post(
            f"/api/v1/admin/listings/{pending_listing.pk}/decision",
            {"decision": "approved"},
            format="json",
        )
        assert resp.status_code == 403

    def test_invalid_decision_rejected(self, admin_client, pending_listing):
        resp = admin_client.post(
            f"/api/v1/admin/listings/{pending_listing.pk}/decision",
            {"decision": "maybe"},
            format="json",
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestListingSubmit:
    def test_submit_without_panorama_fails(self, landlord_client, draft_listing):
        resp = landlord_client.post(f"/api/v1/listings/{draft_listing.pk}/submit")
        assert resp.status_code == 400
        assert resp.data["code"] == "no_panorama"

    def test_submit_with_ready_panorama(self, landlord_client, draft_listing):
        from apps.panoramas.models import Panorama
        Panorama.objects.create(
            listing=draft_listing,
            room_label="Living Room",
            status=Panorama.STATUS_READY,
        )
        resp = landlord_client.post(f"/api/v1/listings/{draft_listing.pk}/submit")
        assert resp.status_code == 200
        draft_listing.refresh_from_db()
        assert draft_listing.status == "pending"

    def test_submit_already_pending_fails(self, landlord_client, pending_listing):
        resp = landlord_client.post(f"/api/v1/listings/{pending_listing.pk}/submit")
        assert resp.status_code == 400
        assert resp.data["code"] == "invalid_status"

    def test_submit_not_found(self, landlord_client):
        resp = landlord_client.post("/api/v1/listings/99999/submit")
        assert resp.status_code == 404


@pytest.mark.django_db
class TestSaveListing:
    def test_save_approved_listing(self, tenant_client, approved_listing):
        resp = tenant_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 201

    def test_save_same_listing_twice_is_200(self, tenant_client, approved_listing):
        tenant_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        resp = tenant_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 200

    def test_save_not_found(self, tenant_client):
        resp = tenant_client.post("/api/v1/listings/99999/save")
        assert resp.status_code == 404

    def test_landlord_cannot_save(self, landlord_client, approved_listing):
        resp = landlord_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 403

    def test_unsave_listing(self, tenant_client, approved_listing):
        tenant_client.post(f"/api/v1/listings/{approved_listing.pk}/save")
        resp = tenant_client.delete(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 204

    def test_unsave_not_saved_is_204(self, tenant_client, approved_listing):
        resp = tenant_client.delete(f"/api/v1/listings/{approved_listing.pk}/save")
        assert resp.status_code == 204


@pytest.mark.django_db
class TestSavedListingsView:
    def test_list_saved_empty(self, tenant_client):
        resp = tenant_client.get("/api/v1/saved/")
        assert resp.status_code == 200
        assert resp.data["results"] == []

    def test_list_saved_returns_only_own(self, tenant_client, tenant_user, approved_listing):
        from apps.listings.models import SavedListing
        SavedListing.objects.create(tenant=tenant_user, listing=approved_listing)
        resp = tenant_client.get("/api/v1/saved/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_landlord_cannot_access_saved(self, landlord_client):
        resp = landlord_client.get("/api/v1/saved/")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestListingDetailExtended:
    def test_delete_archives_listing(self, landlord_client, approved_listing):
        resp = landlord_client.delete(f"/api/v1/listings/{approved_listing.pk}")
        assert resp.status_code == 204
        approved_listing.refresh_from_db()
        assert approved_listing.status == "archived"

    def test_delete_wrong_user_forbidden(self, tenant_client, approved_listing):
        resp = tenant_client.delete(f"/api/v1/listings/{approved_listing.pk}")
        assert resp.status_code == 403

    def test_patch_draft_listing(self, landlord_client, draft_listing):
        resp = landlord_client.patch(
            f"/api/v1/listings/{draft_listing.pk}",
            {"title": "Updated Title"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["title"] == "Updated Title"

    def test_patch_approved_listing_returns_400(self, landlord_client, approved_listing):
        # Only draft listings can be patched
        resp = landlord_client.patch(
            f"/api/v1/listings/{approved_listing.pk}",
            {"title": "Should Fail"},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "not_editable"

    def test_patch_wrong_owner_forbidden(self, tenant_client, draft_listing):
        resp = tenant_client.patch(
            f"/api/v1/listings/{draft_listing.pk}",
            {"title": "Hacked"},
            format="json",
        )
        assert resp.status_code == 403
