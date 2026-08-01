from django.core.management.base import BaseCommand
from admin_portal.models import LLMProvider


class Command(BaseCommand):
    help = 'Populate LLM providers in the database'

    def handle(self, *args, **options):
        providers = [
                    {
                    'name': 'ollama',
                    'display_name': 'Ollama (Gemma 3 Local)',
                    'model_name': 'gemma3:1b',
                    'api_endpoint': '',
                    'api_key_required': False,
                    'is_active': True,
                    'free_tier_limit': 0,
                    'max_tokens': 2048
                },

            {
                'name': 'openai',
                'display_name': 'OpenAI GPT',
                'model_name': 'gpt-4.1-mini',
                'api_endpoint': '',
                'api_key_required': True,
                'is_active': True,
                'free_tier_limit': 1000,
                'max_tokens': 4096
            },
            {
                'name': 'gemini',
                'display_name': 'Google Gemini',
                'model_name': 'gemini-2.5-flash',
                'api_endpoint': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
                'api_key_required': True,
                'is_active': True,
                'free_tier_limit': 1000,
                'max_tokens': 4096
            },
            {
                'name': 'claude',
                'display_name': 'Anthropic Claude',
                'model_name': 'claude-3-haiku-20240307',
                'api_endpoint': 'https://api.anthropic.com/v1/messages',
                'api_key_required': True,
                'is_active': True,
                'free_tier_limit': 1000,
                'max_tokens': 4096
            },
            {
                'name': 'llama',
                'display_name': 'Meta Llama',
                'model_name': 'llama-2-7b-chat-hf',
                'api_endpoint': 'https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf',
                'api_key_required': True,
                'is_active': True,
                'free_tier_limit': 500,
                'max_tokens': 4096
            }
        ]

        for provider_data in providers:
            provider, created = LLMProvider.objects.update_or_create(
                name=provider_data['name'],
                defaults=provider_data
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Created LLM provider: {provider.name}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'Updated LLM provider: {provider.name}')
                )

        self.stdout.write(
            self.style.SUCCESS('LLM providers populated successfully!')
        )
