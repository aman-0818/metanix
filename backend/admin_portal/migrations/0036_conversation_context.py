from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('admin_portal', '0035_llmusagelog_cached_tokens')]

    operations = [
        migrations.AddField('conversation', 'context_started_at', models.DateTimeField(null=True, blank=True)),
        migrations.AddField('conversationsummary', 'covered_through', models.DateTimeField(null=True, blank=True)),
        migrations.AddField('conversationsummary', 'topic_started_at', models.DateTimeField(null=True, blank=True)),
    ]
