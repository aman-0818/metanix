from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_rename_tier_to_multi_tiers'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='cloud_role',
            field=models.CharField(
                choices=[
                    ('none', 'None (use default mapping)'),
                    ('cloud_admin', 'Cloud Admin'),
                    ('cloud_operator', 'Cloud Operator'),
                    ('cloud_viewer', 'Cloud Viewer'),
                ],
                default='none',
                help_text='Explicit cloud automation role. If None, defaults to cloud_admin for admins, cloud_viewer for users.',
                max_length=20,
                verbose_name='Cloud Automation Role',
            ),
        ),
        migrations.AlterField(
            model_name='auditlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('user_created', 'User Created'),
                    ('user_updated', 'User Updated'),
                    ('user_deleted', 'User Deleted'),
                    ('user_role_changed', 'User Role Changed'),
                    ('user_quota_changed', 'User Quota Changed'),
                    ('user_activated', 'User Activated'),
                    ('user_deactivated', 'User Deactivated'),
                    ('user_login', 'User Login'),
                    ('admin_login', 'Admin Login'),
                    ('permission_granted', 'Permission Granted'),
                    ('permission_revoked', 'Permission Revoked'),
                    ('cloud_role_assigned', 'Cloud Role Assigned'),
                    ('cloud_role_revoked', 'Cloud Role Revoked'),
                    ('other', 'Other'),
                ],
                max_length=50,
            ),
        ),
    ]
