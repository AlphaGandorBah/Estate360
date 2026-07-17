from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0002_adminactionlog"),
    ]

    operations = [
        migrations.AlterField(
            model_name="adminactionlog",
            name="action",
            field=models.CharField(
                choices=[
                    ("ban_user", "Banned user"),
                    ("unban_user", "Unbanned user"),
                    ("restrict_user", "Restricted user"),
                    ("unrestrict_user", "Unrestricted user"),
                    ("reset_password", "Sent password reset"),
                    ("delete_user", "Deleted user"),
                    ("delete_listing", "Deleted listing"),
                    ("warn_user", "Warned user"),
                    ("approve_deletion", "Approved account deletion"),
                    ("reject_deletion", "Rejected account deletion"),
                ],
                max_length=30,
            ),
        ),
    ]
