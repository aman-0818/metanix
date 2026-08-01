import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('admin_portal', '0018_add_cost_fields_to_llmprovider'),
    ]

    operations = [
        migrations.CreateModel(
            name='PresentationJob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('prompt', models.TextField(help_text='User prompt / topic for the presentation')),
                ('document_context', models.TextField(blank=True, default='', help_text='Extracted text from uploaded document')),
                ('slide_count', models.PositiveIntegerField(default=10)),
                ('theme', models.CharField(blank=True, default='', max_length=50)),
                ('quality_tier', models.CharField(choices=[('standard', 'Standard'), ('pro', 'Pro'), ('gamma', 'Gamma')], default='standard', max_length=20)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('generating', 'Generating'), ('completed', 'Completed'), ('failed', 'Failed')], db_index=True, default='pending', max_length=20)),
                ('progress_stage', models.CharField(blank=True, default='', help_text='Current pipeline stage for progress tracking', max_length=100)),
                ('progress_detail', models.TextField(blank=True, default='')),
                ('title', models.CharField(blank=True, default='', max_length=255)),
                ('pptx_file', models.FileField(blank=True, null=True, upload_to='presentations/')),
                ('pptx_theme', models.CharField(blank=True, default='', max_length=50)),
                ('style_suggestions', models.JSONField(blank=True, default=list)),
                ('models_used', models.JSONField(blank=True, default=list, help_text='List of AI models used in generation')),
                ('stages_log', models.JSONField(blank=True, default=list, help_text='Pipeline stage completion log')),
                ('raw_content', models.TextField(blank=True, default='', help_text='Raw LLM response for debugging')),
                ('actual_slide_count', models.PositiveIntegerField(blank=True, null=True)),
                ('gamma_url', models.URLField(blank=True, default='', max_length=500)),
                ('error_message', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='presentation_jobs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['user', '-created_at'], name='admin_porta_user_id_pres_idx'),
                    models.Index(fields=['status', '-created_at'], name='admin_porta_status_pres_idx'),
                ],
            },
        ),
    ]
