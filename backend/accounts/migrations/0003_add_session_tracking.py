from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_add_ad_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='session_quota_minutes',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Session quota (minutes)'),
        ),
        migrations.AddField(
            model_name='user',
            name='session_used_seconds',
            field=models.PositiveIntegerField(default=0, verbose_name='Session used (seconds)'),
        ),
        migrations.AddField(
            model_name='user',
            name='session_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Session started at'),
        ),
    ]
