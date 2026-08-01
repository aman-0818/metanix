from rest_framework import serializers
from .models import User, SignInLog, AuditLog
from django.conf import settings
from django.contrib.auth import authenticate


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    session_used_seconds = serializers.SerializerMethodField()
    session_remaining_seconds = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'ad_id',
            'is_active',
            'date_joined',
            'session_quota_minutes',
            'session_used_seconds',
            'session_remaining_seconds',
            'session_started_at',
        )
        # role/is_active/quota/ad_id are admin-only concerns, managed exclusively through
        # admin_portal's separate, is_admin()-gated endpoints — never writable by the
        # user this record belongs to, regardless of whether they're an admin themselves.
        read_only_fields = (
            'id', 'date_joined', 'role', 'ad_id', 'is_active',
            'session_quota_minutes', 'session_started_at',
        )

    def get_session_used_seconds(self, obj):
        return obj.get_session_used_seconds()

    def get_session_remaining_seconds(self, obj):
        return obj.get_session_remaining_seconds()


class UserListSerializer(serializers.ModelSerializer):
    """Serializer for listing users"""
    session_used_seconds = serializers.SerializerMethodField()
    session_remaining_seconds = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'ad_id',
            'is_active',
            'date_joined',
            'session_quota_minutes',
            'session_used_seconds',
            'session_remaining_seconds',
            'session_started_at',
            'has_document_converter',
        )

    def get_session_used_seconds(self, obj):
        return obj.get_session_used_seconds()

    def get_session_remaining_seconds(self, obj):
        return obj.get_session_remaining_seconds()


class LoginSerializer(serializers.Serializer):
    """Serializer for user login"""
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    # Single generic message for every pre-authentication failure path below —
    # returning distinct messages ("not provisioned" vs "disabled" vs "uses
    # Azure AD" vs "invalid credentials") lets an attacker enumerate valid
    # usernames. The real reason still goes to server-side sign-in logging
    # (see failure_reason below / LoginView's log_sign_in call) — it's only
    # the client-facing response that's collapsed.
    GENERIC_ERROR = 'Invalid credentials'

    def _fail(self, specific_reason):
        """Raise the generic client-facing error while stashing the real
        reason on the instance for server-side audit logging (LoginView
        reads self.failure_reason for log_sign_in)."""
        self.failure_reason = specific_reason
        raise serializers.ValidationError(self.GENERIC_ERROR)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if username and password:
            user = (
                User.objects.filter(username=username).first()
                or User.objects.filter(email__iexact=username).first()
                or User.objects.filter(ad_id__iexact=username).first()
            )
            if not user:
                self._fail('User not provisioned in the platform')
            if not user.is_active:
                self._fail('User account is disabled')

            # Check if Azure AD is enabled
            azure_enabled = getattr(settings, 'AZURE_AD_ENABLED', False)
            allow_local_auth = bool(getattr(settings, 'ALLOW_LOCAL_AUTH', False))

            if azure_enabled:
                # Azure AD is enabled: allow admins and users with ALLOW_LOCAL_AUTH
                allow_local_admin = bool(getattr(settings, 'AZURE_AD_ALLOW_LOCAL_ADMIN', False))
                is_admin = user.is_admin()

                # Allow login if:
                # 1. User is admin and AZURE_AD_ALLOW_LOCAL_ADMIN is True, OR
                # 2. ALLOW_LOCAL_AUTH is True (for all users)
                if not ((is_admin and allow_local_admin) or allow_local_auth):
                    self._fail('Password login is disabled. Use Azure AD.')
            else:
                # Azure AD is disabled: check ALLOW_LOCAL_AUTH
                if not allow_local_auth:
                    self._fail('Local password login is disabled')

            # Authenticate with username and password
            if not user.has_usable_password():
                # User was provisioned via Azure AD and has no local password
                self._fail('This account uses Azure AD and has no local password')
            local_user = authenticate(username=user.username, password=password)
            if not local_user:
                # If this is an Azure AD user, note it server-side, but the
                # client still only ever sees the generic message.
                if user.ad_id:
                    self._fail('This account uses Azure AD; wrong password attempted')
                self._fail('Invalid credentials')
            attrs['user'] = user
        else:
            self._fail('Must include username and password')

        return attrs


class SignInLogSerializer(serializers.ModelSerializer):
    """Serializer for SignInLog model"""
    user_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    auth_method_display = serializers.SerializerMethodField()

    class Meta:
        model = SignInLog
        fields = (
            'id',
            'user',
            'user_display',
            'username',
            'status',
            'status_display',
            'ip_address',
            'authentication_method',
            'auth_method_display',
            'timestamp',
            'failure_reason',
        )
        read_only_fields = ('id', 'timestamp')

    def get_user_display(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return "Unknown"

    def get_status_display(self, obj):
        return obj.get_status_display()

    def get_auth_method_display(self, obj):
        return obj.get_authentication_method_display()


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog model"""
    performed_by_display = serializers.SerializerMethodField()
    action_display = serializers.SerializerMethodField()
    action_target_type_display = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            'id',
            'performed_by',
            'performed_by_display',
            'action',
            'action_display',
            'action_target',
            'action_target_type',
            'action_target_type_display',
            'description',
            'old_value',
            'new_value',
            'ip_address',
            'timestamp',
        )
        read_only_fields = ('id', 'timestamp')

    def get_performed_by_display(self, obj):
        if obj.performed_by:
            return f"{obj.performed_by.first_name} {obj.performed_by.last_name}".strip() or obj.performed_by.username
        return "System"

    def get_action_display(self, obj):
        return obj.get_action_display()

    def get_action_target_type_display(self, obj):
        return obj.get_action_target_type_display()