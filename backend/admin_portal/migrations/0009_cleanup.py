"""
Migration 0009: Remove the old llm_provider_old CharField from Conversation
and add the final Conversation index.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('admin_portal', '0008_data_migration'),
    ]

    operations = [
        # Remove the old CharField
        migrations.RemoveField(
            model_name='conversation',
            name='llm_provider_old',
        ),

        # Add conversation indexes now that schema is final
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(
                fields=['user', 'is_active', '-updated_at'],
                name='admin_porta_user_id_3dc897_idx',
            ),
        ),
    ]
