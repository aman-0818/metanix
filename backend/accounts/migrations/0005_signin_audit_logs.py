# Generated migration for SignInLog and AuditLog models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_session_log'),
    ]

    operations = [
        migrations.CreateModel(
            name='SignInLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('success', 'Success'), ('failed', 'Failed')], default='success', max_length=20)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('authentication_method', models.CharField(choices=[('local', 'Local'), ('azure_ad', 'Azure AD'), ('ldap', 'LDAP')], default='local', max_length=50)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('failure_reason', models.TextField(blank=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='sign_in_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('user_created', 'User Created'), ('user_updated', 'User Updated'), ('user_deleted', 'User Deleted'), ('user_role_changed', 'User Role Changed'), ('user_quota_changed', 'User Quota Changed'), ('user_activated', 'User Activated'), ('user_deactivated', 'User Deactivated'), ('admin_login', 'Admin Login'), ('permission_granted', 'Permission Granted'), ('permission_revoked', 'Permission Revoked'), ('other', 'Other')], max_length=50)),
                ('action_target', models.CharField(blank=True, max_length=255)),
                ('action_target_type', models.CharField(choices=[('user', 'User'), ('admin', 'Admin'), ('permission', 'Permission'), ('system', 'System')], default='user', max_length=50)),
                ('description', models.TextField(blank=True)),
                ('old_value', models.JSONField(blank=True, null=True)),
                ('new_value', models.JSONField(blank=True, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('performed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
        migrations.AddIndex(
            model_name='signinlog',
            index=models.Index(fields=['-timestamp'], name='accounts_si_timesta_idx'),
        ),
        migrations.AddIndex(
            model_name='signinlog',
            index=models.Index(fields=['user', '-timestamp'], name='accounts_si_user_id_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['-timestamp'], name='accounts_au_timesta_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['performed_by', '-timestamp'], name='accounts_au_perform_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['action', '-timestamp'], name='accounts_au_action_idx'),
        ),
    ]
