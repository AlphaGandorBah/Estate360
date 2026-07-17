from django.db import migrations, models


def map_agents_to_landlords_on_rollback(apps, schema_editor):
    """Keep accounts usable if this role migration is rolled back."""
    user_model = apps.get_model("accounts", "User")
    user_model.objects.filter(role="agent").update(role="landlord")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_accountdeletionrequest"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("tenant", "Tenant"),
                    ("landlord", "Landlord"),
                    ("agent", "Agent"),
                    ("admin", "Admin"),
                ],
                default="tenant",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            migrations.RunPython.noop,
            reverse_code=map_agents_to_landlords_on_rollback,
        ),
    ]
