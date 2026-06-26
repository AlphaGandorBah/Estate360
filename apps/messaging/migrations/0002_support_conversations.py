import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('listings', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('messaging', '0001_initial'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='conversation',
            name='messaging_c_tenant__01486e_idx',
        ),
        migrations.AlterUniqueTogether(
            name='conversation',
            unique_together=set(),
        ),
        migrations.RenameField(
            model_name='conversation',
            old_name='tenant',
            new_name='initiator',
        ),
        migrations.AlterField(
            model_name='conversation',
            name='initiator',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='initiated_conversations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='conversation',
            name='landlord',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='landlord_conversations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='conversation',
            name='is_support',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterUniqueTogether(
            name='conversation',
            unique_together={('initiator', 'landlord', 'listing')},
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['initiator'], name='messaging_c_initiat_51178d_idx'),
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['is_support'], name='messaging_c_is_supp_35b698_idx'),
        ),
        migrations.AddConstraint(
            model_name='conversation',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_support', True)),
                fields=('initiator',),
                name='unique_support_conversation_per_initiator',
            ),
        ),
    ]
