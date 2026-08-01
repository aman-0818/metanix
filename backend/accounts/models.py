from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.postgres.indexes import GinIndex
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class SignInLog(models.Model):
    """Log for tracking user sign-ins"""
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]
    
    # SET_NULL (not CASCADE): this is an audit trail — deleting a user must never
    # silently erase their sign-in history. `username` below is the durable label
    # once `user` goes null.
    user = models.ForeignKey('User', on_delete=models.SET_NULL, related_name='sign_in_logs', null=True, blank=True)
    username = models.CharField(max_length=255)  # Store username even if user record is deleted
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='success')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    authentication_method = models.CharField(
        max_length=50,
        choices=[
            ('local', 'Local'),
            ('azure_ad', 'Azure AD'),
        ],
        default='local'
    )
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    failure_reason = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True, default='')
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['user', '-timestamp']),
            # Admin search filters on username__icontains (get_sign_in_logs) —
            # a plain btree index can't serve a leading-wildcard LIKE; pg_trgm
            # GIN lets Postgres use the index for that.
            GinIndex(fields=['username'], name='signinlog_username_trgm',
                     opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return f"{self.username} - {self.get_status_display()} - {self.timestamp}"


class AuditLog(models.Model):
    """Log for tracking admin actions and important changes"""
    ACTION_CHOICES = [
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
        ('other', 'Other'),
    ]
    
    performed_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    action_target = models.CharField(max_length=255, blank=True)  # e.g., username, object ID
    action_target_type = models.CharField(
        max_length=50,
        choices=[
            ('user', 'User'),
            ('admin', 'Admin'),
            ('permission', 'Permission'),
            ('system', 'System'),
        ],
        default='user'
    )
    description = models.TextField(blank=True)
    old_value = models.JSONField(null=True, blank=True)  # Store old values for change logs
    new_value = models.JSONField(null=True, blank=True)  # Store new values for change logs
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['performed_by', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
            # Admin search filters on action__icontains (get_audit_logs).
            GinIndex(fields=['action'], name='auditlog_action_trgm',
                     opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return f"{self.get_action_display()} by {self.performed_by} on {self.timestamp}"


class SessionLog(models.Model):
    # SET_NULL, matching AuditLog/LLMUsageLog — session history is an audit
    # record and shouldn't be erased just because the user account was deleted.
    user = models.ForeignKey('User', on_delete=models.SET_NULL, related_name='session_logs',
                             null=True, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        username = self.user.username if self.user else 'deleted user'
        return f"{username} - {self.started_at}"


class User(AbstractUser):
    """Custom user model with role field"""
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('user', 'User'),
    ]

    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default='user',
        verbose_name=_('Role')
    )

    ad_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        verbose_name=_('Active Directory ID')
    )
    ad_dn = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        verbose_name=_('Active Directory DN')
    )

    session_quota_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Session quota (minutes)')
    )
    session_used_seconds = models.PositiveIntegerField(
        default=0,
        verbose_name=_('Session used (seconds)')
    )
    session_started_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Session started at')
    )

    # decimal_places=6 to match admin_portal.LLMUsageLog.cost_usd — previously
    # 4, which meant `F('cost_used_usd') + cost` silently rounded every
    # increment to 4 places, permanently drifting from the sum of the ledger.
    cost_quota_usd = models.DecimalField(
        max_digits=12, decimal_places=6,
        null=True, blank=True,
        verbose_name=_('Cost quota (USD)')
    )
    cost_used_usd = models.DecimalField(
        max_digits=12, decimal_places=6,
        default=0,
        verbose_name=_('Cost used (USD)')
    )

    # Durable facts/preferences/context extracted from the user's conversations
    # (see admin_portal.views.ChatView._maybe_update_memory), injected into the
    # system prompt of every conversation so context carries across chat sessions.
    long_term_memory = models.TextField(blank=True, default='')

    # Feature flags
    has_document_converter = models.BooleanField(
        default=False,
        verbose_name=_('Document Converter Access'),
        help_text=_('Grant access to the document conversion feature')
    )
    # Additional fields can be added here
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('User')
        verbose_name_plural = _('Users')
        indexes = [
            # Serves performed_by__username__icontains (get_audit_logs) and
            # username__icontains (get_llm_usage_logs) — both leading-wildcard
            # searches that a plain btree index (AbstractUser's unique index
            # on username) cannot use.
            GinIndex(fields=['username'], name='user_username_trgm',
                     opclasses=['gin_trgm_ops']),
        ]

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    def is_admin(self):
        return self.role == 'admin'

    def is_regular_user(self):
        return self.role == 'user'

    def _get_session_quota_seconds(self):
        if not self.session_quota_minutes:
            return None
        return int(self.session_quota_minutes) * 60

    def get_session_used_seconds(self):
        used_seconds = self.session_used_seconds or 0
        if self.session_started_at:
            used_seconds += int((timezone.now() - self.session_started_at).total_seconds())
        return max(0, used_seconds)

    def get_session_remaining_seconds(self):
        quota_seconds = self._get_session_quota_seconds()
        if not quota_seconds:
            return None
        remaining = quota_seconds - self.get_session_used_seconds()
        return max(0, remaining)

    def is_session_quota_exceeded(self):
        remaining = self.get_session_remaining_seconds()
        return remaining is not None and remaining <= 0

    def start_session(self):
        if not self.session_started_at:
            now = timezone.now()
            self.session_started_at = now
            self.save(update_fields=['session_started_at', 'updated_at'])
            SessionLog.objects.create(user=self, started_at=now)

    def stop_session(self):
        if not self.session_started_at:
            return
        now = timezone.now()
        elapsed = int((now - self.session_started_at).total_seconds())
        if elapsed < 0:
            elapsed = 0
        new_used = (self.session_used_seconds or 0) + elapsed
        quota_seconds = self._get_session_quota_seconds()
        if quota_seconds is not None:
            new_used = min(new_used, quota_seconds)
        self.session_used_seconds = new_used
        started_at = self.session_started_at
        self.session_started_at = None
        self.save(update_fields=['session_used_seconds', 'session_started_at', 'updated_at'])

        log = (
            SessionLog.objects.filter(user=self, ended_at__isnull=True)
            .order_by('-started_at')
            .first()
        )
        if log:
            log.ended_at = now
            log.duration_seconds = elapsed
            log.save(update_fields=['ended_at', 'duration_seconds'])
        else:
            SessionLog.objects.create(
                user=self,
                started_at=started_at,
                ended_at=now,
                duration_seconds=elapsed,
            )
