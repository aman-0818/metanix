from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('admin_portal', '0022_add_message_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='CloudNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(default='cloud-automation', help_text='Which system sent this notification', max_length=100)),
                ('title', models.CharField(max_length=255)),
                ('message', models.TextField()),
                ('severity', models.CharField(choices=[('info', 'Info'), ('warning', 'Warning'), ('error', 'Error')], default='info', max_length=20)),
                ('request_id', models.IntegerField(blank=True, null=True)),
                ('resource_type', models.CharField(blank=True, default='', max_length=100)),
                ('resource_name', models.CharField(blank=True, default='', max_length=200)),
                ('requested_by', models.CharField(blank=True, default='', max_length=150)),
                ('action', models.CharField(blank=True, default='', max_length=100)),
                ('extra_data', models.JSONField(blank=True, default=dict)),
                ('is_read', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='cloudnotification',
            index=models.Index(fields=['is_read', '-created_at'], name='admin_porta_is_read_idx'),
        ),
    ]
