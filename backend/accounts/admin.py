from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, SessionLog


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Custom admin for User model"""
    list_display = (
        'username',
        'email',
        'first_name',
        'last_name',
        'role',
        'is_active',
        'session_quota_minutes',
        'session_used_seconds',
        'date_joined',
    )
    list_filter = ('role', 'is_active', 'is_staff', 'date_joined')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('-date_joined',)

    fieldsets = UserAdmin.fieldsets + (
        ('Additional Info', {'fields': ('role', 'session_quota_minutes', 'session_used_seconds', 'session_started_at')}),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Additional Info', {'fields': ('role', 'email', 'session_quota_minutes')}),
    )


@admin.register(SessionLog)
class SessionLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'started_at', 'ended_at', 'duration_seconds')
    list_filter = ('started_at', 'ended_at')
    search_fields = ('user__username', 'user__email')
# Aman 
