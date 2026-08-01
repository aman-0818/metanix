"""
Migration 0008: Data migration to populate Conversation.llm_provider FK
from the old llm_provider_old CharField values.

Also sets provider_type on existing LLMProvider records.
"""

from django.db import migrations


# Map old name strings to provider_type values
PROVIDER_TYPE_MAP = {
    'openai': 'azure_openai',
    'gemini': 'google',
    'claude': 'anthropic',
    'ollama': 'ollama',
    'llama': 'ollama',
}

# Map old name strings to env var names and enhanced metadata
PROVIDER_METADATA = {
    'openai': {
        'api_key_env_var': 'AZURE_OPENAI_API_KEY',
        'icon_name': 'openai',
        'display_name': 'GPT-4o Mini',
    },
    'gemini': {
        'api_key_env_var': 'GEMINI_API_KEY',
        'icon_name': 'gemini',
        'display_name': 'Google Gemini',
    },
    'claude': {
        'api_key_env_var': 'CLAUDE_API_KEY',
        'icon_name': 'claude',
        'display_name': 'Anthropic Claude',
    },
    'ollama': {
        'api_key_env_var': '',
        'icon_name': 'ollama',
        'display_name': 'Ollama',
    },
    'llama': {
        'api_key_env_var': '',
        'icon_name': 'llama',
        'display_name': 'Meta Llama',
    },
}


def populate_conversation_fk(apps, schema_editor):
    """Map old string llm_provider values to FK references."""
    Conversation = apps.get_model('admin_portal', 'Conversation')
    LLMProvider = apps.get_model('admin_portal', 'LLMProvider')

    # Build lookup from name → LLMProvider instance
    provider_map = {}
    for provider in LLMProvider.objects.all():
        provider_map[provider.name] = provider

    # Update each conversation
    for conv in Conversation.objects.all():
        old_val = conv.llm_provider_old
        if old_val and old_val in provider_map:
            conv.llm_provider = provider_map[old_val]
            conv.save(update_fields=['llm_provider_id'])


def update_provider_metadata(apps, schema_editor):
    """Set provider_type and other metadata on existing LLMProvider records."""
    LLMProvider = apps.get_model('admin_portal', 'LLMProvider')

    for provider in LLMProvider.objects.all():
        name = provider.name
        if name in PROVIDER_TYPE_MAP:
            provider.provider_type = PROVIDER_TYPE_MAP[name]
        if name in PROVIDER_METADATA:
            meta = PROVIDER_METADATA[name]
            provider.api_key_env_var = meta.get('api_key_env_var', '')
            provider.icon_name = meta.get('icon_name', '')
            if not provider.display_name or provider.display_name == name:
                provider.display_name = meta.get('display_name', provider.display_name)
        provider.save()


def reverse_noop(apps, schema_editor):
    """No-op reverse for data migration."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('admin_portal', '0007_schema_updates'),
    ]

    operations = [
        migrations.RunPython(update_provider_metadata, reverse_noop),
        migrations.RunPython(populate_conversation_fk, reverse_noop),
    ]
