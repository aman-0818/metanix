from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from admin_portal.models import LLMProvider, UserLLMPermission

User = get_user_model()

class Command(BaseCommand):
    help = 'Grant LLM permissions to existing users'

    def add_arguments(self, parser):
        parser.add_argument(
            '--grant-all',
            action='store_true',
            help='Grant all available LLMs to all users',
        )
        parser.add_argument(
            '--user',
            type=str,
            help='Grant permissions to specific user (username)',
        )
        parser.add_argument(
            '--llm',
            type=str,
            help='Specific LLM to grant (defaults to all)',
        )

    def handle(self, *args, **options):
        # Get all active LLM providers
        llm_providers = LLMProvider.objects.filter(is_active=True)

        if not llm_providers.exists():
            self.stdout.write(self.style.WARNING('No active LLM providers found'))
            return

        # Determine which users to update
        if options['user']:
            try:
                users = [User.objects.get(username=options['user'])]
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User "{options["user"]}" not found'))
                return
        else:
            users = User.objects.filter(is_active=True)

        # Filter LLMs if specific one requested
        if options['llm']:
            llm_providers = llm_providers.filter(name=options['llm'])
            if not llm_providers.exists():
                self.stdout.write(self.style.ERROR(f'LLM provider "{options["llm"]}" not found'))
                return

        permissions_created = 0

        for user in users:
            # Skip admin users if not specifically requested
            if user.role == 'admin' and not options['user']:
                continue

            for llm in llm_providers:
                permission, created = UserLLMPermission.objects.get_or_create(
                    user=user,
                    llm_provider=llm,
                    defaults={'granted_by': User.objects.filter(role='admin').first()}
                )
                if created:
                    permissions_created += 1
                    self.stdout.write(
                        f'Granted {llm.display_name} access to {user.username}'
                    )

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {permissions_created} LLM permissions')
        )