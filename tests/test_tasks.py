"""Tests for Celery tasks (run synchronously via CELERY_TASK_ALWAYS_EAGER)."""
import pytest
from django.utils import timezone


@pytest.mark.django_db
class TestChatbotReloadTask:
    def test_reload_index_task_runs(self):
        from apps.chatbot.tasks import reload_index
        reload_index()  # Should not raise


@pytest.mark.django_db
class TestPurgeIdempotencyKeys:
    def test_purges_expired_keys(self, tenant_user):
        from apps.common.models import IdempotencyKey
        import uuid
        # Create an expired key
        IdempotencyKey.objects.create(
            key=uuid.uuid4(),
            user=tenant_user,
            request_hash="a" * 64,
            status="done",
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )
        # Create a valid key
        IdempotencyKey.objects.create(
            key=uuid.uuid4(),
            user=tenant_user,
            request_hash="b" * 64,
            status="done",
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        from apps.common.tasks import purge_expired_idempotency_keys
        count = purge_expired_idempotency_keys()
        assert count == 1
        assert IdempotencyKey.objects.count() == 1

    def test_purge_empty_table_returns_zero(self, db):
        from apps.common.tasks import purge_expired_idempotency_keys
        result = purge_expired_idempotency_keys()
        assert result == 0


@pytest.mark.django_db
class TestExpireStaleListings:
    def test_expires_old_approved_listings(self, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        from apps.listings.tasks import expire_stale_listings
        from django.conf import settings

        old_date = timezone.now() - timezone.timedelta(days=settings.LISTING_STALE_DAYS + 1)
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Old Listing",
            description="Been here forever",
            property_type="apartment",
            bedrooms=1,
            bathrooms=1,
            price_annual=3_000_000,
            currency="SLE",
            location_area="aberdeen",
            status=ListingStatus.APPROVED,
        )
        # Manually backdate updated_at
        Listing.objects.filter(pk=listing.pk).update(updated_at=old_date)

        count = expire_stale_listings()
        assert count >= 1
        listing.refresh_from_db()
        assert listing.status == ListingStatus.EXPIRED

    def test_does_not_expire_fresh_listings(self, approved_listing):
        from apps.listings.tasks import expire_stale_listings
        count = expire_stale_listings()
        assert count == 0


@pytest.mark.django_db
class TestSendListingDecisionEmail:
    def test_sends_email_for_approved(self, verified_landlord):
        from apps.listings.models import Listing, ListingStatus
        from apps.listings.tasks import send_listing_decision_email
        listing = Listing.objects.create(
            owner=verified_landlord,
            title="Email Test Listing",
            description="desc",
            property_type="apartment",
            bedrooms=2,
            bathrooms=1,
            price_annual=5_000_000,
            currency="SLE",
            location_area="aberdeen",
            status=ListingStatus.APPROVED,
        )
        from django.core import mail
        send_listing_decision_email(listing.pk, "approved", "")
        assert len(mail.outbox) == 1

    def test_silently_ignores_nonexistent_listing(self, db):
        from apps.listings.tasks import send_listing_decision_email
        # Should not raise
        send_listing_decision_email(99999, "approved", "")


@pytest.mark.django_db
class TestSendVerificationResultTask:
    def test_sends_email_to_user(self, tenant_user):
        from apps.accounts.tasks import send_verification_result_task
        from django.core import mail
        send_verification_result_task(str(tenant_user.pk), "approved", "All good")
        assert len(mail.outbox) == 1
        assert "approved" in mail.outbox[0].subject.lower()

    def test_handles_missing_user_gracefully(self, db):
        from apps.accounts.tasks import send_verification_result_task
        import uuid
        send_verification_result_task(str(uuid.uuid4()), "approved", "")
        # Should not raise


@pytest.mark.django_db
class TestPurgeOldInteractionsTask:
    def test_purges_old_interactions(self, tenant_user, approved_listing):
        from apps.listings.models import UserInteraction
        from apps.recommendations.tasks import purge_old_interactions

        old_date = timezone.now() - timezone.timedelta(days=181)  # hardcoded 180-day cutoff in task
        interaction = UserInteraction.objects.create(
            user=tenant_user,
            listing=approved_listing,
            event_type=UserInteraction.EVENT_VIEW,
        )
        UserInteraction.objects.filter(pk=interaction.pk).update(created_at=old_date)

        count = purge_old_interactions()
        assert count >= 1

    def test_keeps_recent_interactions(self, tenant_user, approved_listing):
        from apps.listings.models import UserInteraction
        from apps.recommendations.tasks import purge_old_interactions
        UserInteraction.objects.create(
            user=tenant_user,
            listing=approved_listing,
            event_type=UserInteraction.EVENT_VIEW,
        )
        count = purge_old_interactions()
        assert count == 0
