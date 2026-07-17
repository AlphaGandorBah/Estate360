from django.db import migrations, models
from django.db.models import Count, Max


def consolidate_listingless_conversations(apps, schema_editor):
    """Merge duplicate general-enquiry threads before enforcing uniqueness."""
    Conversation = apps.get_model("messaging", "Conversation")
    Message = apps.get_model("messaging", "Message")
    database = schema_editor.connection.alias

    duplicate_groups = (
        Conversation.objects.using(database)
        .filter(
            is_support=False,
            listing_id__isnull=True,
            landlord_id__isnull=False,
        )
        .values("initiator_id", "landlord_id")
        .annotate(thread_count=Count("id"))
        .filter(thread_count__gt=1)
    )

    # Materialize the grouped keys before deleting from the same table. This
    # avoids backend-specific cursor behaviour while the result set is being
    # mutated (notably during SQLite development/test migrations).
    for group in list(duplicate_groups):
        threads = list(
            Conversation.objects.using(database)
            .filter(
                initiator_id=group["initiator_id"],
                landlord_id=group["landlord_id"],
                is_support=False,
                listing_id__isnull=True,
            )
            .order_by("created_at", "id")
            .values("id", "last_message_at")
        )
        canonical = threads[0]
        duplicate_ids = [thread["id"] for thread in threads[1:]]
        all_thread_ids = [thread["id"] for thread in threads]

        latest_message_at = (
            Message.objects.using(database)
            .filter(conversation_id__in=all_thread_ids)
            .aggregate(latest=Max("created_at"))["latest"]
        )
        activity_times = [
            thread["last_message_at"]
            for thread in threads
            if thread["last_message_at"] is not None
        ]
        if latest_message_at is not None:
            activity_times.append(latest_message_at)

        Message.objects.using(database).filter(
            conversation_id__in=duplicate_ids
        ).update(conversation_id=canonical["id"])

        if activity_times:
            Conversation.objects.using(database).filter(
                id=canonical["id"]
            ).update(last_message_at=max(activity_times))

        Conversation.objects.using(database).filter(id__in=duplicate_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("messaging", "0002_support_conversations"),
    ]

    operations = [
        migrations.RunPython(
            consolidate_listingless_conversations,
            migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="conversation",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    is_support=False,
                    landlord__isnull=False,
                    listing__isnull=True,
                ),
                fields=("initiator", "landlord"),
                name="unique_general_conversation_per_provider",
            ),
        ),
    ]
