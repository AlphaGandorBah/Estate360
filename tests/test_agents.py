"""Focused coverage for the agent property-provider role."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import LandlordVerification, User
from apps.listings.models import Listing, ListingStatus
from apps.messaging.models import Conversation
from apps.panoramas.models import Panorama

LISTING_PAYLOAD = {
    "title": "Agent-managed Lumley apartment",
    "description": "A well maintained apartment represented by a local agent.",
    "property_type": "apartment",
    "bedrooms": 2,
    "bathrooms": 1,
    "price_annual": 18_000_000,
    "currency": "SLE",
    "location_area": "lumley",
}


def _client_for(user: User) -> APIClient:
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    return client


@pytest.fixture
def verified_agent(db):
    return User.objects.create_user(
        email="agent@test.com",
        password="TestPass@123",
        full_name="Test Agent",
        role=User.ROLE_AGENT,
        is_verified=True,
    )


@pytest.fixture
def unverified_agent(db):
    return User.objects.create_user(
        email="new-agent@test.com",
        password="TestPass@123",
        full_name="New Agent",
        role=User.ROLE_AGENT,
        is_verified=False,
    )


@pytest.fixture
def agent_client(verified_agent):
    return _client_for(verified_agent)


@pytest.fixture
def approved_agent_listing(verified_agent):
    return Listing.objects.create(
        owner=verified_agent,
        status=ListingStatus.APPROVED,
        **LISTING_PAYLOAD,
    )


@pytest.mark.django_db
def test_agent_can_register(api_client):
    response = api_client.post(
        "/api/v1/auth/register",
        {
            "email": "registered-agent@test.com",
            "full_name": "Registered Agent",
            "phone": "+23276000000",
            "role": User.ROLE_AGENT,
            "password": "StrongPass@123",
            "confirm_password": "StrongPass@123",
        },
        format="json",
    )

    assert response.status_code == 201
    assert User.objects.get(email="registered-agent@test.com").role == User.ROLE_AGENT


@pytest.mark.django_db
def test_agent_role_is_exposed_on_profiles(api_client, agent_client, verified_agent):
    own_profile = agent_client.get("/api/v1/users/me")
    public_profile = api_client.get(f"/api/v1/users/{verified_agent.pk}/public")

    assert own_profile.status_code == 200
    assert own_profile.data["role"] == User.ROLE_AGENT
    assert public_profile.status_code == 200
    assert public_profile.data["role"] == User.ROLE_AGENT


@pytest.mark.django_db
def test_admin_can_filter_the_user_directory_by_agent(admin_client, verified_agent):
    response = admin_client.get("/api/v1/admin/users/?role=agent")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [
        str(verified_agent.pk)
    ]


@pytest.mark.django_db
def test_verified_agent_can_create_and_submit_listing(agent_client, verified_agent):
    create_response = agent_client.post(
        "/api/v1/listings/", LISTING_PAYLOAD, format="json"
    )

    assert create_response.status_code == 201
    assert create_response.data["owner_role"] == User.ROLE_AGENT

    listing = Listing.objects.get(pk=create_response.data["id"])
    Panorama.objects.create(
        listing=listing,
        room_label="Living room",
        status=Panorama.STATUS_READY,
    )
    submit_response = agent_client.post(f"/api/v1/listings/{listing.pk}/submit")

    assert submit_response.status_code == 200
    listing.refresh_from_db()
    assert listing.owner == verified_agent
    assert listing.status == ListingStatus.PENDING


@pytest.mark.django_db
def test_unverified_agent_cannot_create_listing(unverified_agent):
    response = _client_for(unverified_agent).post(
        "/api/v1/listings/", LISTING_PAYLOAD, format="json"
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_unverified_agent_cannot_upload_listing_media(unverified_agent):
    listing = Listing.objects.create(
        owner=unverified_agent,
        status=ListingStatus.DRAFT,
        **LISTING_PAYLOAD,
    )

    response = _client_for(unverified_agent).post(
        f"/api/v1/listings/{listing.pk}/panoramas", {}, format="multipart"
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_agent_can_use_identity_verification_flow(unverified_agent):
    response = _client_for(unverified_agent).get("/api/v1/verification/me")

    # Permission passed; this agent simply has not submitted documents yet.
    assert response.status_code == 404
    assert response.data["code"] == "not_found"


@pytest.mark.django_db
def test_admin_can_approve_agent_verification(
    admin_client, unverified_agent
):
    verification = LandlordVerification.objects.create(
        user=unverified_agent,
        document_type=LandlordVerification.DOC_NATIONAL_ID,
        document_front_key="verifications/front/agent.jpg",
        selfie_key="verifications/selfie/agent.jpg",
    )

    response = admin_client.post(
        f"/api/v1/admin/verifications/{verification.pk}/decision",
        {"decision": "approved"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["user_role"] == User.ROLE_AGENT
    unverified_agent.refresh_from_db()
    assert unverified_agent.is_verified is True


@pytest.mark.django_db
def test_agent_verification_rejection_revokes_listing_access(
    admin_client, verified_agent
):
    verification = LandlordVerification.objects.create(
        user=verified_agent,
        document_type=LandlordVerification.DOC_NATIONAL_ID,
        document_front_key="verifications/front/rejected-agent.jpg",
        selfie_key="verifications/selfie/rejected-agent.jpg",
    )

    response = admin_client.post(
        f"/api/v1/admin/verifications/{verification.pk}/decision",
        {"decision": "rejected", "notes": "Document is unclear."},
        format="json",
    )

    assert response.status_code == 200
    verified_agent.refresh_from_db()
    assert verified_agent.is_verified is False
    assert _client_for(verified_agent).post(
        "/api/v1/listings/", LISTING_PAYLOAD, format="json"
    ).status_code == 403


@pytest.mark.django_db
def test_public_listing_filter_returns_only_the_selected_agent(
    api_client, approved_listing, approved_agent_listing
):
    response = api_client.get(
        f"/api/v1/listings/?owner_id={approved_agent_listing.owner_id}"
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [
        approved_agent_listing.pk
    ]


@pytest.mark.django_db
def test_tenant_can_start_listing_conversation_with_agent(
    tenant_client, tenant_user, agent_client, verified_agent, approved_agent_listing
):
    response = tenant_client.post(
        "/api/v1/conversations/",
        {
            "listing_id": approved_agent_listing.pk,
            "initial_message": "Can I arrange a viewing?",
        },
        format="json",
    )

    assert response.status_code == 201
    assert str(response.data["provider_id"]) == str(verified_agent.pk)
    assert response.data["provider_name"] == verified_agent.full_name
    assert response.data["provider_role"] == User.ROLE_AGENT
    # Existing clients can continue reading the legacy response fields.
    assert response.data["landlord_id"] == response.data["provider_id"]
    assert response.data["landlord_name"] == response.data["provider_name"]

    conversation = Conversation.objects.get(pk=response.data["id"])
    assert conversation.initiator == tenant_user
    assert conversation.landlord == verified_agent

    agent_list = agent_client.get("/api/v1/conversations/")
    assert agent_list.status_code == 200
    assert [item["id"] for item in agent_list.data["results"]] == [conversation.pk]

    reply = agent_client.post(
        f"/api/v1/conversations/{conversation.pk}/messages",
        {"body": "Yes, I can arrange that."},
        format="json",
    )
    assert reply.status_code == 201


@pytest.mark.django_db
def test_legacy_landlord_id_accepts_an_agent_for_agent_listing(
    tenant_client, verified_agent, approved_agent_listing
):
    response = tenant_client.post(
        "/api/v1/conversations/",
        {
            "landlord_id": str(verified_agent.pk),
            "listing_id": approved_agent_listing.pk,
        },
        format="json",
    )

    assert response.status_code == 201
    assert str(response.data["provider_id"]) == str(verified_agent.pk)


@pytest.mark.django_db
def test_listing_conversation_rejects_unrelated_provider(
    tenant_client, verified_landlord, approved_agent_listing
):
    response = tenant_client.post(
        "/api/v1/conversations/",
        {
            "provider_id": str(verified_landlord.pk),
            "listing_id": approved_agent_listing.pk,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "provider_mismatch"
    assert not Conversation.objects.exists()


@pytest.mark.django_db
def test_listing_conversation_requires_an_approved_listing(
    tenant_client, verified_agent
):
    draft = Listing.objects.create(
        owner=verified_agent,
        status=ListingStatus.DRAFT,
        **LISTING_PAYLOAD,
    )

    response = tenant_client.post(
        "/api/v1/conversations/",
        {"provider_id": str(verified_agent.pk), "listing_id": draft.pk},
        format="json",
    )

    assert response.status_code == 404
    assert not Conversation.objects.exists()


@pytest.mark.django_db
def test_agent_cannot_use_tenant_only_discovery_features(
    agent_client, approved_agent_listing
):
    assert agent_client.post(
        f"/api/v1/listings/{approved_agent_listing.pk}/save"
    ).status_code == 403
    assert agent_client.get("/api/v1/saved/").status_code == 403
    assert agent_client.get("/api/v1/recommendations/").status_code == 403
    assert agent_client.get("/api/v1/preferences/me").status_code == 403


@pytest.mark.django_db
def test_agent_can_contact_support_but_cannot_start_a_rental_enquiry(
    agent_client, verified_landlord
):
    enquiry = agent_client.post(
        "/api/v1/conversations/",
        {"provider_id": str(verified_landlord.pk)},
        format="json",
    )
    assert enquiry.status_code == 403

    support = agent_client.post(
        "/api/v1/conversations/",
        {"support": True, "initial_message": "I need help with a listing."},
        format="json",
    )
    assert support.status_code == 201
    assert support.data["is_support"] is True
