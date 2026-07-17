"""Regression coverage for messaging data migrations."""
from datetime import timedelta

import pytest
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


@pytest.mark.django_db(transaction=True)
def test_listingless_conversation_migration_merges_duplicates_without_message_loss(
    tenant_user, verified_landlord
):
    migrate_from = [("messaging", "0002_support_conversations")]
    migrate_to = [("messaging", "0003_unique_general_conversation")]

    executor = MigrationExecutor(connection)
    executor.migrate(migrate_from)
    old_apps = executor.loader.project_state(migrate_from).apps
    Conversation = old_apps.get_model("messaging", "Conversation")
    Message = old_apps.get_model("messaging", "Message")

    base_time = timezone.now() - timedelta(days=1)
    first = Conversation.objects.create(
        initiator_id=tenant_user.pk,
        landlord_id=verified_landlord.pk,
        listing_id=None,
        is_support=False,
    )
    second = Conversation.objects.create(
        initiator_id=tenant_user.pk,
        landlord_id=verified_landlord.pk,
        listing_id=None,
        is_support=False,
    )
    Conversation.objects.filter(pk=first.pk).update(
        created_at=base_time,
        last_message_at=base_time + timedelta(hours=1),
    )
    Conversation.objects.filter(pk=second.pk).update(
        created_at=base_time + timedelta(hours=2),
        last_message_at=base_time + timedelta(hours=4),
    )

    first_message = Message.objects.create(
        conversation_id=first.pk,
        sender_id=tenant_user.pk,
        body="First thread message",
    )
    second_message = Message.objects.create(
        conversation_id=second.pk,
        sender_id=verified_landlord.pk,
        body="Duplicate thread message",
    )
    Message.objects.filter(pk=first_message.pk).update(
        created_at=base_time + timedelta(hours=3)
    )
    latest_activity = base_time + timedelta(hours=5)
    Message.objects.filter(pk=second_message.pk).update(created_at=latest_activity)

    try:
        executor = MigrationExecutor(connection)
        executor.migrate(migrate_to)
        new_apps = executor.loader.project_state(migrate_to).apps
        Conversation = new_apps.get_model("messaging", "Conversation")
        Message = new_apps.get_model("messaging", "Message")

        remaining = list(
            Conversation.objects.filter(
                initiator_id=tenant_user.pk,
                landlord_id=verified_landlord.pk,
                listing_id=None,
                is_support=False,
            )
        )
        assert [thread.pk for thread in remaining] == [first.pk]
        assert remaining[0].last_message_at == latest_activity
        assert set(
            Message.objects.filter(conversation_id=first.pk).values_list(
                "pk", flat=True
            )
        ) == {first_message.pk, second_message.pk}

        with pytest.raises(IntegrityError), transaction.atomic():
            Conversation.objects.create(
                initiator_id=tenant_user.pk,
                landlord_id=verified_landlord.pk,
                listing_id=None,
                is_support=False,
            )
    finally:
        # Keep the test database at the project's current migration state even
        # if an assertion fails after the forward migration.
        MigrationExecutor(connection).migrate(migrate_to)
