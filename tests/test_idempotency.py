"""Tests for idempotency key enforcement."""
import pytest
from apps.common.models import IdempotencyKey


@pytest.mark.django_db
class TestIdempotency:
    def test_replay_same_key_same_body(self, landlord_client):
        data = {
            "title": "Idempotent Test",
            "description": "Testing idempotency on listing creation.",
            "property_type": "apartment",
            "bedrooms": 1,
            "bathrooms": 1,
            "price_annual": 8_000_000,
            "currency": "SLE",
            "location_area": "aberdeen",
        }
        key = "aabbccdd-0000-0000-0000-112233445566"
        r1 = landlord_client.post("/api/v1/listings/", data, format="json", HTTP_IDEMPOTENCY_KEY=key)
        r2 = landlord_client.post("/api/v1/listings/", data, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.data["id"] == r2.data["id"]

    def test_same_key_different_body_returns_422(self, landlord_client):
        base = {
            "title": "Original",
            "description": "Original description.",
            "property_type": "apartment",
            "bedrooms": 1,
            "bathrooms": 1,
            "price_annual": 8_000_000,
            "currency": "SLE",
            "location_area": "aberdeen",
        }
        key = "aabbccdd-1111-0000-0000-112233445566"
        r1 = landlord_client.post("/api/v1/listings/", base, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == 201

        different = {**base, "title": "Modified Title"}
        r2 = landlord_client.post("/api/v1/listings/", different, format="json", HTTP_IDEMPOTENCY_KEY=key)
        assert r2.status_code == 422
