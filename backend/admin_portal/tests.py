from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


class LocalAdminUserCreationEndpointTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='secret123',
            role='admin',
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_admin_can_create_local_user(self):
        response = self.client.post(
            reverse('admin-local-user-create'),
            {
                'username': 'newlocaluser',
                'email': 'newlocal@example.com',
                'password': 'StrongPassword123!',
                'role': 'user',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username='newlocaluser').exists())

        created = User.objects.get(username='newlocaluser')
        self.assertEqual(created.role, 'user')
        self.assertTrue(created.check_password('StrongPassword123!'))
