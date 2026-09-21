from django.core.management.base import BaseCommand
from admin_portal.models import LLMProvider


class Command(BaseCommand):
    help = 'Populate the DB-backed LLM providers in the current schema'

    def handle(self, *args, **options):
        providers = [
            {
                'name': 'ollama',
                'display_name': 'Ollama (Gemma 3 Local)',
                'description': 'Local Ollama-hosted chat model',
                'icon_name': 'cpu',
                'provider_kind': 'chat',
                'provider_type': 'ollama',
                'model_name': 'gemma3:1b',
                'api_endpoint': '',
                'api_key_env_var': '',
                'encrypted_api_key': '',
                'max_tokens': 2048,
                'temperature': 0.7,
                'supports_code': True,
                'supports_document_upload': False,
                'supports_streaming': True,
                'is_active': True,
                'is_default': True,
                'sort_order': 1,
            },
            {
                'name': 'openai',
                'display_name': 'OpenAI GPT',
                'description': 'OpenAI GPT model',
                'icon_name': 'sparkles',
                'provider_kind': 'chat',
                'provider_type': 'openai',
                'model_name': 'gpt-4.1-mini',
                'api_endpoint': '',
                'api_key_env_var': 'OPENAI_API_KEY',
                'encrypted_api_key': '',
                'max_tokens': 4096,
                'temperature': 0.7,
                'supports_code': True,
                'supports_document_upload': True,
                'supports_streaming': True,
                'is_active': True,
                'is_default': False,
                'sort_order': 2,
            },
            {
                'name': 'gemini',
                'display_name': 'Google Gemini',
                'description': 'Google Gemini chat model',
                'icon_name': 'sparkles',
                'provider_kind': 'chat',
                'provider_type': 'google',
                'model_name': 'gemini-3.6-flash',
                'api_endpoint': 'https://generativelanguage.googleapis.com',
                'api_key_env_var': 'GEMINI_API_KEY',
                'encrypted_api_key': '',
                'max_tokens': 4096,
                'temperature': 0.7,
                'supports_code': True,
                'supports_document_upload': True,
                'supports_streaming': True,
                'is_active': True,
                'is_default': False,
                'sort_order': 3,
            },
            {
                'name': 'claude',
                'display_name': 'Anthropic Claude',
                'description': 'Anthropic Claude chat model',
                'icon_name': 'sparkles',
                'provider_kind': 'chat',
                'provider_type': 'anthropic',
                'model_name': 'claude-3-haiku-20240307',
                'api_endpoint': 'https://api.anthropic.com/v1/messages',
                'api_key_env_var': 'CLAUDE_API_KEY',
                'encrypted_api_key': '',
                'max_tokens': 4096,
                'temperature': 0.7,
                'supports_code': True,
                'supports_document_upload': True,
                'supports_streaming': True,
                'is_active': True,
                'is_default': False,
                'sort_order': 4,
            },
            {
                'name': 'llama',
                'display_name': 'Meta Llama',
                'description': 'Hugging Face Llama inference model',
                'icon_name': 'sparkles',
                'provider_kind': 'chat',
                'provider_type': 'huggingface',
                'model_name': 'llama-2-7b-chat-hf',
                'api_endpoint': 'https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf',
                'api_key_env_var': 'HUGGINGFACE_API_KEY',
                'encrypted_api_key': '',
                'max_tokens': 4096,
                'temperature': 0.7,
                'supports_code': True,
                'supports_document_upload': True,
                'supports_streaming': True,
                'is_active': True,
                'is_default': False,
                'sort_order': 5,
            },
        ]

        for provider_data in providers:
            provider, created = LLMProvider.objects.update_or_create(
                name=provider_data['name'],
                defaults=provider_data,
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created LLM provider: {provider.name}'))
            else:
                self.stdout.write(self.style.WARNING(f'Updated LLM provider: {provider.name}'))

        self.stdout.write(self.style.SUCCESS('LLM providers populated successfully!'))

