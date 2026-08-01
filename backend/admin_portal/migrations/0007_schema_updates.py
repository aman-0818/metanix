"""
Migration 0007: Schema updates for DB-driven architecture.
- Add new fields to LLMProvider (provider_type, api_key_env_var, capabilities, etc.)
- Add new fields to UserLLMPermission (quota_minutes, used_seconds, etc.)
- Add chat_mode to Conversation
- Rename Conversation.llm_provider CharField → llm_provider_old
- Add Conversation.llm_provider_id as nullable FK to LLMProvider
- Create AppConfig and Document models
- Add llm_provider FK to LLMUsageLog
- Update indexes
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('admin_portal', '0006_alter_llmusagelog_options_and_more'),
    ]

    operations = [
        # ─── AppConfig model ───
        migrations.CreateModel(
            name='AppConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(db_index=True, max_length=100, unique=True)),
                ('value', models.TextField(blank=True, default='')),
                ('value_type', models.CharField(choices=[('str', 'String'), ('int', 'Integer'), ('float', 'Float'), ('bool', 'Boolean'), ('json', 'JSON')], default='str', max_length=10)),
                ('description', models.TextField(blank=True)),
                ('category', models.CharField(blank=True, db_index=True, default='general', max_length=50)),
                ('is_sensitive', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'App Config',
                'verbose_name_plural': 'App Configs',
                'ordering': ['category', 'key'],
            },
        ),

        # ─── Document model ───
        migrations.CreateModel(
            name='Document',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='documents/%Y/%m/')),
                ('original_filename', models.CharField(max_length=255)),
                ('file_type', models.CharField(max_length=10)),
                ('file_size', models.PositiveIntegerField()),
                ('extracted_text', models.TextField(blank=True)),
                ('extraction_status', models.CharField(choices=[('pending', 'Pending'), ('success', 'Success'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('extraction_error', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('conversation', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='documents', to='admin_portal.conversation')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),

        # ─── LLMProvider: remove old fields ───
        migrations.RemoveField(
            model_name='llmprovider',
            name='api_key_required',
        ),
        migrations.RemoveField(
            model_name='llmprovider',
            name='free_tier_limit',
        ),

        # ─── LLMProvider: add new fields ───
        migrations.AddField(
            model_name='llmprovider',
            name='provider_type',
            field=models.CharField(
                choices=[
                    ('azure_openai', 'Azure OpenAI'),
                    ('openai', 'OpenAI'),
                    ('google', 'Google Gemini'),
                    ('anthropic', 'Anthropic Claude'),
                    ('ollama', 'Ollama'),
                    ('huggingface', 'HuggingFace'),
                    ('litellm', 'LiteLLM Generic'),
                ],
                default='ollama',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='api_key_env_var',
            field=models.CharField(blank=True, default='', help_text='Name of env var holding API key', max_length=100),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='api_version',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='temperature',
            field=models.FloatField(default=0.2),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='extra_config',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='system_prompt',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='icon_name',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='sort_order',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='is_default',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='supports_code',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='supports_document_upload',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='supports_streaming',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='llmprovider',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),

        # ─── LLMProvider: alter existing fields ───
        migrations.AlterField(
            model_name='llmprovider',
            name='name',
            field=models.CharField(db_index=True, max_length=100, unique=True),
        ),
        migrations.AlterField(
            model_name='llmprovider',
            name='display_name',
            field=models.CharField(max_length=200),
        ),
        migrations.AlterField(
            model_name='llmprovider',
            name='model_name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='llmprovider',
            name='api_endpoint',
            field=models.URLField(blank=True, default='', max_length=500),
        ),

        # ─── UserLLMPermission: add quota fields ───
        migrations.AddField(
            model_name='userllmpermission',
            name='quota_minutes',
            field=models.PositiveIntegerField(blank=True, help_text='NULL = unlimited', null=True),
        ),
        migrations.AddField(
            model_name='userllmpermission',
            name='used_seconds',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userllmpermission',
            name='last_used_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userllmpermission',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='userllmpermission',
            name='expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),

        # ─── Conversation: add chat_mode ───
        migrations.AddField(
            model_name='conversation',
            name='chat_mode',
            field=models.CharField(
                choices=[
                    ('general', 'General'),
                    ('code', 'Code'),
                    ('summarize', 'Summarize'),
                    ('document', 'Document Q&A'),
                ],
                default='general',
                max_length=20,
            ),
        ),

        # ─── Conversation: rename llm_provider CharField → llm_provider_old ───
        migrations.RenameField(
            model_name='conversation',
            old_name='llm_provider',
            new_name='llm_provider_old',
        ),

        # ─── Conversation: add llm_provider FK (nullable for now) ───
        migrations.AddField(
            model_name='conversation',
            name='llm_provider',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='conversations',
                to='admin_portal.llmprovider',
            ),
        ),

        # ─── LLMUsageLog: add llm_provider FK ───
        migrations.AddField(
            model_name='llmusagelog',
            name='llm_provider',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='usage_logs',
                to='admin_portal.llmprovider',
            ),
        ),

        # ─── Update indexes ───
        # Remove old LLMUsageLog indexes
        migrations.RemoveIndex(
            model_name='llmusagelog',
            name='admin_porta_user_id_2df7d5_idx',
        ),
        migrations.RemoveIndex(
            model_name='llmusagelog',
            name='admin_porta_provide_514f50_idx',
        ),

        # ─── Update Meta options ───
        migrations.AlterModelOptions(
            name='llmprovider',
            options={'ordering': ['sort_order', 'display_name'], 'verbose_name': 'LLM Provider', 'verbose_name_plural': 'LLM Providers'},
        ),
        migrations.AlterModelOptions(
            name='userllmpermission',
            options={'ordering': ['-granted_at']},
        ),
        migrations.AlterModelOptions(
            name='conversationsummary',
            options={'verbose_name_plural': 'Conversation summaries'},
        ),
        migrations.AlterModelOptions(
            name='llmusagelog',
            options={'ordering': ['-created_at'], 'verbose_name': 'LLM Usage Log'},
        ),

        # ─── Add new indexes ───
        migrations.AddIndex(
            model_name='llmprovider',
            index=models.Index(fields=['is_active', 'sort_order'], name='admin_porta_is_acti_104f13_idx'),
        ),
        migrations.AddIndex(
            model_name='userllmpermission',
            index=models.Index(fields=['user', 'is_active'], name='admin_porta_user_id_cecb69_idx'),
        ),
        migrations.AddIndex(
            model_name='llmusagelog',
            index=models.Index(fields=['user', '-created_at'], name='admin_porta_user_id_4f13a4_idx'),
        ),
        migrations.AddIndex(
            model_name='llmusagelog',
            index=models.Index(fields=['provider', '-created_at'], name='admin_porta_provide_0a5c12_idx'),
        ),
    ]
