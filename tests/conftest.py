"""Shared pytest fixtures."""
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache():
    """DRF's ScopedRateThrottle counters live in the LocMemCache, which
    persists across the whole test session (DB rollback doesn't touch it).
    Without this, auth-throttled tests start tripping 429s once enough other
    tests have hit the same scope earlier in the run."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def tenant_user(db):
    user = User.objects.create_user(
        email="tenant@test.com",
        password="TestPass@123",
        full_name="Test Tenant",
        role="tenant",
        is_verified=False,
    )
    return user


@pytest.fixture
def verified_landlord(db):
    user = User.objects.create_user(
        email="landlord@test.com",
        password="TestPass@123",
        full_name="Test Landlord",
        role="landlord",
        is_verified=True,
    )
    return user


@pytest.fixture
def admin_user(db):
    user = User.objects.create_superuser(
        email="admin@test.com",
        password="TestPass@123",
        full_name="Test Admin",
        role="admin",
    )
    return user


@pytest.fixture
def tenant_client(tenant_user):
    client = APIClient()
    refresh = RefreshToken.for_user(tenant_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def landlord_client(verified_landlord):
    client = APIClient()
    refresh = RefreshToken.for_user(verified_landlord)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    refresh = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def approved_listing(db, verified_landlord):
    from apps.listings.models import Listing, ListingStatus
    return Listing.objects.create(
        owner=verified_landlord,
        title="Test Listing Aberdeen",
        description="A lovely apartment in Aberdeen with great views.",
        property_type="apartment",
        bedrooms=2,
        bathrooms=1,
        price_annual=12_000_000,
        currency="SLE",
        location_area="aberdeen",
        status=ListingStatus.APPROVED,
    )
