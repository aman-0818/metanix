from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from decouple import config

User = get_user_model()


class Command(BaseCommand):
    help = 'Create default admin user'

    def handle(self, *args, **options):
        username = config('ADMIN_USERNAME', default='')
        password = config('ADMIN_PASSWORD', default='')
        email = config('ADMIN_EMAIL', default='')

        if not username or not password or not email:
            self.stdout.write(
                self.style.ERROR('ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL must be set in .env')
            )
            return

        # Check if user already exists
        existing_user = User.objects.filter(username=username).first()
        if existing_user:
            existing_user.email = email
            existing_user.role = 'admin'
            existing_user.is_staff = True
            existing_user.is_superuser = True
            existing_user.set_password(password)
            existing_user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f'Updated admin user "{username}" with role "admin"'
                )
            )
            return

        # Create the admin user
        user = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            role='admin',
            is_staff=True,
            is_superuser=True
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created admin user "{username}" with role "admin"'
            )
        )
