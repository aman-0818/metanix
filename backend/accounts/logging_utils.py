"""Utility functions for logging sign-ins and audit events"""
import logging
from django.utils import timezone
from .models import SignInLog, AuditLog, User

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Extract client IP address from request, respecting proxy headers."""
    if request is None:
        return None
    
    # Check X-Forwarded-For first (nginx sets this)
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        # Fallback to X-Real-IP (nginx also sets this)
        x_real_ip = request.META.get('HTTP_X_REAL_IP')
        if x_real_ip:
            ip = x_real_ip.strip()
        else:
            ip = request.META.get('REMOTE_ADDR')
    return ip


def resolve_ip_location(ip_address):
    """
    Resolve an IP address to a human-readable location string.
    Uses ip-api.com (free, no API key, 45 req/min).
    Returns e.g. 'Mumbai, Maharashtra, India' or '' on failure.
    Skips private/local IPs.
    """
    if not ip_address:
        return ''
    
    # Skip private/localhost IPs
    private_prefixes = ('127.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
                        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
                        '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
                        '172.30.', '172.31.', '192.168.', '0.', '::1', 'fe80:')
    if any(ip_address.startswith(p) for p in private_prefixes):
        return 'Local Network'
    
    try:
        import httpx
        resp = httpx.get(
            f'http://ip-api.com/json/{ip_address}',
            params={'fields': 'status,city,regionName,country'},
            timeout=3.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get('status') == 'success':
                parts = [p for p in [data.get('city'), data.get('regionName'), data.get('country')] if p]
                return ', '.join(parts)
    except Exception as exc:
        logger.debug(f"Geo-IP lookup failed for {ip_address}: {exc}")
    
    return ''


def get_user_agent(request):
    """Extract user agent from request"""
    if request is None:
        return ""
    return request.META.get('HTTP_USER_AGENT', '')


def log_sign_in(username, user=None, status='success', ip_address=None, user_agent='',
                authentication_method='local', failure_reason='', request=None):
    """
    Log a sign-in event
    
    Args:
        username: Username attempting to sign in
        user: User object (optional, set to None if login failed)
        status: 'success' or 'failed'
        ip_address: Client IP address
        user_agent: Client user agent
        authentication_method: 'local' or 'azure_ad'
        failure_reason: Reason for failure if status is 'failed'
        request: Django request object (optional, used to extract IP and user agent if not provided)
    """
    if request:
        if not ip_address:
            ip_address = get_client_ip(request)
        if not user_agent:
            user_agent = get_user_agent(request)
    
    # Resolve geo-IP location
    location = resolve_ip_location(ip_address)
    
    SignInLog.objects.create(
        user=user,
        username=username,
        status=status,
        ip_address=ip_address,
        user_agent=user_agent,
        authentication_method=authentication_method,
        failure_reason=failure_reason,
        location=location,
        timestamp=timezone.now()
    )


def log_audit_event(action, performed_by=None, action_target='', action_target_type='user',
                    description='', old_value=None, new_value=None, ip_address=None,
                    user_agent='', request=None):
    """
    Log an audit event for admin actions
    
    Args:
        action: Action type (e.g., 'user_created', 'user_updated')
        performed_by: User who performed the action
        action_target: What was affected (e.g., username)
        action_target_type: Type of target ('user', 'admin', 'permission', 'system')
        description: Description of the action
        old_value: Previous values (dict)
        new_value: New values (dict)
        ip_address: Client IP address
        user_agent: Client user agent
        request: Django request object (optional)
    """
    if request:
        if not ip_address:
            ip_address = get_client_ip(request)
        if not user_agent:
            user_agent = get_user_agent(request)
    
    AuditLog.objects.create(
        performed_by=performed_by,
        action=action,
        action_target=action_target,
        action_target_type=action_target_type,
        description=description,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent,
        timestamp=timezone.now()
    )
