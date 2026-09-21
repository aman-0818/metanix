"""
Admin Portal Views — DB-driven, no hardcoded provider logic.
Uses the universal LLM engine and per-model hour quotas.
"""
import json
import logging
import os
import re
import time
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.cache import cache
from django.db import transaction, close_old_connections
from django.db.models import Sum, Count, Q, F, Max
from django.http import StreamingHttpResponse
from django.utils import timezone

from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, parser_classes, throttle_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

# Document conversion/OCR endpoints get the blanket user/anon throttles PLUS
# this scoped one (settings.py DEFAULT_THROTTLE_RATES['document_conversion']).
_DOCUMENT_THROTTLE_CLASSES = list(api_settings.DEFAULT_THROTTLE_CLASSES) + [ScopedRateThrottle]

from accounts.logging_utils import log_audit_event
from .models import (
    LLMProvider, UserLLMPermission, Conversation, Message,
    ConversationSummary, Document, LLMUsageLog, AppConfig, ConversionJob,
    Project, SavedPrompt,
)
from .serializers import (
    LLMProviderSerializer, LLMProviderListSerializer, LLMProviderCreateSerializer,
    UserLLMPermissionSerializer,
    ConversationSerializer, ConversationListSerializer, ConversationCreateSerializer,
    ChatRequestSerializer, MessageSerializer, DocumentSerializer,
    LLMUsageLogSerializer, AppConfigSerializer, ConversionJobSerializer,
    ProjectSerializer, SavedPromptSerializer,
)
from .llm_engine import call_llm, stream_llm, get_system_prompt
from .conversation_titles import ensure_title
from .skills import detect_intent, detect_export_format, is_pure_export_request, UNSPECIFIED_FORMAT
from .llm_queue import llm_request_queue
from .services.pptx_generator import generate_pptx, parse_llm_slides, extract_presentation_metadata
from .services.file_export import generate_export
from .services.chat_metrics import timed
from .services.document_converter import (
    INPUT_FORMATS, OUTPUT_FORMATS, QUALITY_PRESETS,
    get_file_category, get_available_outputs,
)
from .tasks import (
    summarize_conversation_task, chat_stream_post_process_task,
    generate_pptx_task, convert_document_task, extract_text_task,
)

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def admin_create_local_user(request):
    """Create a local username/password user from the admin panel.

    This endpoint complements the AD sync flow and serves the
    `createLocalUser()` frontend wrapper already present in the client.
    """
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User

    username = (request.data.get('username') or '').strip()
    email = (request.data.get('email') or '').strip()
    password = request.data.get('password') or ''
    role = (request.data.get('role') or 'user').strip()

    if role not in {'admin', 'user'}:
        return Response({'error': 'role must be admin or user'}, status=400)

    if not username:
        return Response({'error': 'username is required'}, status=400)
    if not email:
        return Response({'error': 'email is required'}, status=400)
    if not password:
        return Response({'error': 'password is required'}, status=400)
    if len(password) < 6:
        return Response({'error': 'password must be at least 6 characters'}, status=400)

    if User.objects.filter(username__iexact=username).exists():
        return Response({'error': 'username already exists'}, status=409)
    if User.objects.filter(email__iexact=email).exists():
        return Response({'error': 'email already exists'}, status=409)

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        role=role,
        is_active=True,
    )

    # Keep local admins visible in the Django staff UI without giving them
    # every superuser capability by default.
    if role == 'admin':
        user.is_staff = True
        user.save(update_fields=['is_staff'])

    log_audit_event(
        action='user_created',
        performed_by=request.user,
        action_target=user.username,
        description=f"Created local {role} user {user.username}",
        request=request,
    )

    return Response({
        'message': 'Local user created successfully',
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'ad_id': user.ad_id,
            'is_active': user.is_active,
            'date_joined': user.date_joined.isoformat(),
            'llm_permissions': [],
            'has_document_converter': user.has_document_converter,
        },
    }, status=201)

# FIX (ThreadPoolExecutor / bare threads removed):
# _presentation_executor = ThreadPoolExecutor(max_workers=5) — REMOVED.
# threading.Thread(...) post-processing in ChatView/ChatStreamView — REMOVED
#   (bare threads run DB queries but are never touched by Django's
#   close_old_connections(), which only fires around the request/response
#   cycle — a real connection-leak risk under load).
# PPTX generation, document conversion, text extraction, and chat
# post-processing now all run via Celery (admin_portal/tasks.py) on one of
# two queues — see CELERY_TASK_ROUTES in multimodel/settings.py and the
# celery-worker-chat / celery-worker-documents services in docker-compose.yml.


# ===========================================================================
#  Admin Dashboard
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def admin_dashboard_stats(request):
    """Dashboard stats for admin panel."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User
    total_users = User.objects.count()
    total_admins = User.objects.filter(role='admin').count()
    active_users = User.objects.filter(is_active=True).count()
    recent_users = User.objects.order_by('-date_joined')[:5].values(
        'id', 'username', 'email', 'date_joined'
    )

    return Response({
        'total_users': total_users,
        'total_admins': total_admins,
        'active_users': active_users,
        'recent_users': list(recent_users),
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def admin_usage_stats(request):
    """Global LLM usage stats for admin."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    totals = LLMUsageLog.objects.aggregate(
        total_tokens=Sum('total_tokens'),
        total_cost=Sum('cost_usd'),
    )
    by_user = list(
        LLMUsageLog.objects.values('user__username', 'user__email')
        .annotate(total_tokens=Sum('total_tokens'), total_cost=Sum('cost_usd'))
        .order_by('-total_tokens')[:20]
    )
    by_model = list(
        LLMUsageLog.objects.values('model')
        .annotate(
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('cost_usd'),
            provider=Max('provider'),
        )
        .order_by('-total_tokens')[:20]
    )

    return Response({
        'totals': totals,
        'by_user': by_user,
        'by_model': by_model,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def admin_usage_analytics(request):
    """
    Comprehensive usage analytics for admin dashboard.
    Query params: days (default 30), start, end
    """
    from accounts.models import User
    from django.db.models import Avg, Max, Min
    from django.db.models.functions import TruncDate, TruncHour
    from datetime import timedelta
    import decimal

    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    # Date range
    try:
        days = int(request.query_params.get('days', 30))
    except (ValueError, TypeError):
        days = 30
    start_str = request.query_params.get('start')
    end_str = request.query_params.get('end')

    if start_str and end_str:
        from django.utils.dateparse import parse_datetime
        start_date = parse_datetime(start_str) or (timezone.now() - timedelta(days=days))
        end_date = parse_datetime(end_str) or timezone.now()
    else:
        # Round down to a 2-minute bucket (matching the cache TTL below) so
        # back-to-back dashboard loads with no explicit range share a cache
        # key instead of each computing a unique now() and always missing.
        now = timezone.now()
        bucket_seconds = 120
        epoch_seconds = int(now.timestamp())
        end_date = now - timedelta(seconds=epoch_seconds % bucket_seconds, microseconds=now.microsecond)
        start_date = end_date - timedelta(days=days)

    # This view runs 8+ full aggregate scans over LLMUsageLog — cache the
    # assembled response for a short TTL, keyed on the actual query params
    # (start/end/days) so different date ranges don't collide.
    # `refresh=true` (sent by the frontend's Refresh button) skips the lookup —
    # otherwise switching models mid-conversation and immediately checking
    # Overview/Models/Users can silently serve a snapshot from just before the
    # switch, while the separate, uncached Logs tab shows the change instantly.
    cache_key = f"admin_usage_analytics:{start_date.isoformat()}:{end_date.isoformat()}:{days}"
    force_refresh = request.query_params.get('refresh') == 'true'
    if not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

    logs = LLMUsageLog.objects.filter(created_at__gte=start_date, created_at__lte=end_date)

    # --- Overview totals ---
    totals = logs.aggregate(
        total_requests=Count('id'),
        sum_tokens=Sum('total_tokens'),
        sum_prompt_tokens=Sum('prompt_tokens'),
        sum_cached_tokens=Sum('cached_tokens'),
        sum_completion_tokens=Sum('completion_tokens'),
        sum_cost=Sum('cost_usd'),
        avg_tokens=Avg('total_tokens'),
        avg_latency=Avg('latency_ms'),
        max_latency=Max('latency_ms'),
        min_latency=Min('latency_ms'),
    )
    # Convert Decimal to float for JSON
    for k in totals:
        if isinstance(totals[k], decimal.Decimal):
            totals[k] = float(totals[k])

    # Remap keys for frontend compatibility
    totals = {
        'total_requests': totals['total_requests'],
        'total_tokens': totals['sum_tokens'],
        'total_prompt_tokens': totals['sum_prompt_tokens'],
        'total_cached_tokens': totals['sum_cached_tokens'],
        'total_completion_tokens': totals['sum_completion_tokens'],
        'total_cost': totals['sum_cost'],
        'avg_tokens_per_request': totals['avg_tokens'],
        'avg_latency': totals['avg_latency'],
        'max_latency': totals['max_latency'],
        'min_latency': totals['min_latency'],
    }

    # Unique users count
    totals['unique_users'] = logs.values('user').distinct().count()
    totals['active_models'] = logs.values('model').distinct().count()

    # --- Daily trend (fill in zero-activity days for a complete timeline) ---
    daily_trend_raw = list(
        logs.annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(
            requests=Count('id'),
            tokens=Sum('total_tokens'),
            cached_tokens=Sum('cached_tokens'),
            cost=Sum('cost_usd'),
            users=Count('user', distinct=True),
            avg_latency=Avg('latency_ms'),
        )
        .order_by('date')
    )
    # Build a lookup by date
    trend_by_date = {}
    for row in daily_trend_raw:
        d = row['date']
        for k in ('cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])
        trend_by_date[d] = row

    # Fill every day in the range
    daily_trend = []
    current_day = start_date.date() if hasattr(start_date, 'date') else start_date
    end_day = end_date.date() if hasattr(end_date, 'date') else end_date
    while current_day <= end_day:
        if current_day in trend_by_date:
            entry = trend_by_date[current_day]
            entry['date'] = current_day.isoformat()
            daily_trend.append(entry)
        else:
            daily_trend.append({
                'date': current_day.isoformat(),
                'requests': 0,
                'tokens': 0,
                'cached_tokens': 0,
                'cost': 0.0,
                'users': 0,
                'avg_latency': None,
            })
        current_day += timedelta(days=1)

    # --- By model (with detailed stats, merged across providers) ---
    by_model = list(
        logs.values('model')
        .annotate(
            requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            prompt_tokens=Sum('prompt_tokens'),
            cached_tokens=Sum('cached_tokens'),
            completion_tokens=Sum('completion_tokens'),
            total_cost=Sum('cost_usd'),
            avg_latency=Avg('latency_ms'),
            unique_users=Count('user', distinct=True),
            last_used=Max('created_at'),
            provider=Max('provider'),
        )
        .order_by('-total_tokens')
    )
    for row in by_model:
        for k in ('total_cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])
        if row.get('last_used'):
            row['last_used'] = row['last_used'].isoformat()

    # --- By user (with detailed stats) ---
    by_user = list(
        logs.filter(user__isnull=False)
        .values('user__id', 'user__username', 'user__email')
        .annotate(
            requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            prompt_tokens=Sum('prompt_tokens'),
            cached_tokens=Sum('cached_tokens'),
            completion_tokens=Sum('completion_tokens'),
            total_cost=Sum('cost_usd'),
            avg_latency=Avg('latency_ms'),
            models_used=Count('model', distinct=True),
            last_active=Max('created_at'),
        )
        .order_by('-total_tokens')[:50]
    )
    for row in by_user:
        for k in ('total_cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])
        if row.get('last_active'):
            row['last_active'] = row['last_active'].isoformat()

    # --- Hourly distribution (activity heatmap) ---
    hourly = list(
        logs.annotate(hour=TruncHour('created_at'))
        .values('hour')
        .annotate(requests=Count('id'))
        .order_by('hour')
    )
    # Compress into hour-of-day summary
    hour_of_day = {}
    for row in hourly:
        h = row['hour'].hour if row['hour'] else 0
        hour_of_day[h] = hour_of_day.get(h, 0) + row['requests']
    activity_by_hour = [{'hour': h, 'requests': hour_of_day.get(h, 0)} for h in range(24)]

    # --- Top conversations by token usage ---
    top_conversations = list(
        logs.filter(user__isnull=False)
        .values('user__username')
        .annotate(
            conversations=Count('id'),
            tokens=Sum('total_tokens'),
        )
        .order_by('-tokens')[:10]
    )

    # --- Cost breakdown by provider type ---
    cost_by_provider = list(
        logs.values('provider')
        .annotate(
            total_cost=Sum('cost_usd'),
            total_tokens=Sum('total_tokens'),
            cached_tokens=Sum('cached_tokens'),
            requests=Count('id'),
        )
        .order_by('-total_cost')
    )
    for row in cost_by_provider:
        for k in ('total_cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])

    # --- Per-user model breakdown ---
    # For each user, show how much they used each model (merged across providers)
    user_model_breakdown = list(
        logs.filter(user__isnull=False)
        .values('user__id', 'user__username', 'model')
        .annotate(
            requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            cached_tokens=Sum('cached_tokens'),
            total_cost=Sum('cost_usd'),
            avg_latency=Avg('latency_ms'),
            last_used=Max('created_at'),
            provider=Max('provider'),
        )
        .order_by('user__username', '-total_tokens')
    )
    for row in user_model_breakdown:
        for k in ('total_cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])
        if row.get('last_used'):
            row['last_used'] = row['last_used'].isoformat()

    # --- Model popularity ranking ---
    model_popularity = list(
        logs.values('model')
        .annotate(
            request_count=Count('id'),
            unique_users=Count('user', distinct=True),
            total_tokens=Sum('total_tokens'),
            cached_tokens=Sum('cached_tokens'),
            total_cost=Sum('cost_usd'),
            provider=Max('provider'),
        )
        .order_by('-request_count')
    )
    for row in model_popularity:
        for k in ('total_cost',):
            if isinstance(row.get(k), decimal.Decimal):
                row[k] = float(row[k])

    response_data = {
        'period': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
            'days': days,
        },
        'totals': totals,
        'daily_trend': daily_trend,
        'by_model': by_model,
        'by_user': by_user,
        'activity_by_hour': activity_by_hour,
        'top_conversations': top_conversations,
        'cost_by_provider': cost_by_provider,
        'user_model_breakdown': user_model_breakdown,
        'model_popularity': model_popularity,
    }
    cache.set(cache_key, response_data, timeout=120)  # 2-minute TTL
    return Response(response_data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def my_usage_stats(request):
    """Current user's LLM usage."""
    logs = LLMUsageLog.objects.filter(user=request.user)
    totals = logs.aggregate(
        total_prompt_tokens=Sum('prompt_tokens'),
        total_completion_tokens=Sum('completion_tokens'),
        total_tokens=Sum('total_tokens'),
        total_cost=Sum('cost_usd'),
    )
    by_provider = list(
        logs.values('provider')
        .annotate(total_tokens=Sum('total_tokens'), total_cost=Sum('cost_usd'))
        .order_by('-total_tokens')
    )
    return Response({'totals': totals, 'by_provider': by_provider})


# ===========================================================================
#  Admin — User Management
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def admin_user_list(request):
    """List all users with their permissions and session info."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User, SessionLog
    from django.db.models import Prefetch, Count, OuterRef, Subquery

    # Top-5-per-user via a correlated subquery (OuterRef), rather than a
    # sliced Prefetch queryset (SessionLog.objects.order_by(...)[:5]).
    #
    # Verified finding: on this stack's Django version (4.2.17), a sliced
    # Prefetch queryset is NOT actually N+1 — Django 4.1+ auto-converts it
    # into a single query using ROW_NUMBER() OVER (PARTITION BY user_id ...)
    # when the backend supports window functions (Postgres does). Confirmed
    # via CaptureQueriesContext with 4-6 test users: the original sliced
    # Prefetch produced exactly 1 query for the session_logs fetch,
    # regardless of user count, and its SQL is a ROW_NUMBER()-partitioned
    # subquery. So the N+1 described for this call site does not reproduce
    # here; this rewrite is kept anyway because it is Django-version-agnostic
    # and self-documenting (the "top 5 per user" intent doesn't depend on an
    # internal query-planner optimization a future edit to this queryset
    # could silently opt back out of) and is equally 1 query in practice.
    recent_ids_per_user = (
        SessionLog.objects.filter(user_id=OuterRef('user_id'))
        .order_by('-started_at')
        .values_list('id', flat=True)[:5]
    )
    recent_sessions_qs = SessionLog.objects.filter(
        id__in=Subquery(recent_ids_per_user)
    ).order_by('-started_at')
    users = User.objects.prefetch_related(
        'llm_permissions__llm_provider',
        Prefetch('session_logs', queryset=recent_sessions_qs, to_attr='_prefetched_sessions'),
    ).annotate(session_total_count=Count('session_logs')).order_by('-date_joined')

    result = []
    for u in users:
        recent_sessions = getattr(u, '_prefetched_sessions', [])
        session_total = u.session_total_count
        perms = u.llm_permissions.all()  # Already prefetched with llm_provider
        perm_names = [p.llm_provider.name for p in perms]

        # Build per-model quota info
        model_quotas = []
        for p in perms:
            model_quotas.append({
                'provider_id': p.llm_provider.id,
                'provider_name': p.llm_provider.name,
                'provider_display_name': p.llm_provider.display_name,
                'quota_minutes': p.quota_minutes,
                'used_seconds': p.used_seconds,
                'remaining_seconds': p.get_remaining_seconds(),
                'is_active': p.is_active,
            })

        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email or '',
            'first_name': u.first_name,
            'last_name': u.last_name,
            'role': u.role,
            'ad_id': u.ad_id,
            'is_active': u.is_active,
            'date_joined': u.date_joined.isoformat(),
            'llm_permissions': perm_names,
            'model_quotas': model_quotas,
            'session_quota_minutes': u.session_quota_minutes,
            'session_used_seconds': u.session_used_seconds,
            'session_remaining_seconds': u.get_session_remaining_seconds(),
            'session_started_at': u.session_started_at.isoformat() if u.session_started_at else None,
            'session_total_count': session_total,
            'cost_quota_usd': str(u.cost_quota_usd) if u.cost_quota_usd is not None else None,
            'cost_used_usd': str(u.cost_used_usd) if u.cost_used_usd else '0',
            'has_document_converter': u.has_document_converter,
            'session_logs': [
                {
                    'id': sl.id,
                    'started_at': sl.started_at.isoformat(),
                    'ended_at': sl.ended_at.isoformat() if sl.ended_at else None,
                    'duration_seconds': sl.duration_seconds,
                }
                for sl in recent_sessions
            ],
        })

    return Response(result)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def admin_user_search(request):
    """Search Azure AD for users."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    query = request.data.get('query', '').strip()
    if not query or len(query) < 2:
        return Response({'error': 'Query must be at least 2 characters'}, status=400)

    # Try Azure AD Graph
    if getattr(settings, 'AZURE_AD_GRAPH_ENABLED', False):
        try:
            from accounts.graph_client import GraphClient
            client = GraphClient()
            results = client.search_users(query, limit=20)
            return Response({'results': results})
        except Exception as e:
            logger.warning(f"Azure AD Graph search failed: {e}")
            return Response({'error': f'Azure AD search failed: {e}'}, status=502)

    return Response({'error': 'User directory search not configured'}, status=501)


def _normalize_session_quota_input(data):
    """Parse days/hours/minutes into total minutes."""
    days = data.get('session_quota_days')
    hours = data.get('session_quota_hours')
    minutes = data.get('session_quota_minutes')

    if days is None and hours is None and minutes is None:
        return None

    total = 0
    if days is not None:
        total += int(days) * 1440
    if hours is not None:
        total += int(hours) * 60
    if minutes is not None:
        total += int(minutes)

    return total if total > 0 else None


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def admin_user_sync(request):
    """Create or update a user from AD search results."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User

    ad_id = request.data.get('ad_id', '').strip()
    role = request.data.get('role', 'user')
    llm_permissions = request.data.get('llm_permissions', [])
    session_quota = _normalize_session_quota_input(request.data)
    cost_quota_raw = request.data.get('cost_quota_usd')

    if not ad_id:
        return Response({'error': 'ad_id is required'}, status=400)

    # Lookup or create user
    user = None
    for field in ['ad_id', 'email', 'username']:
        try:
            user = User.objects.get(**{field: ad_id})
            break
        except User.DoesNotExist:
            continue

    created = False
    if not user:
        # Try Graph API to get user details
        user_data = {}
        if getattr(settings, 'AZURE_AD_GRAPH_ENABLED', False):
            try:
                from accounts.graph_client import GraphClient
                client = GraphClient()
                results = client.search_users(ad_id)
                if results:
                    user_data = results[0]
            except Exception:
                pass

        username = user_data.get('username') or ad_id.split('@')[0]
        try:
            user = User.objects.create(
                username=username,
                email=(user_data.get('email') or (ad_id if '@' in ad_id else '')),
                ad_id=user_data.get('ad_id') or ad_id,
                first_name=user_data.get('first_name') or '',
                last_name=user_data.get('last_name') or '',
                role=role,
                is_active=True,
            )
            created = True
        except Exception as exc:
            # Handle duplicate key or other DB errors gracefully
            logger.exception(f"Failed to create user {username}: {exc}")
            # Retry lookup — the sequence may have been out of sync
            user = (
                User.objects.filter(username=username).first()
                or User.objects.filter(email__iexact=ad_id).first()
            )
            if not user:
                return Response(
                    {'error': f'Failed to create user: {exc}'},
                    status=500,
                )

    # Update role and quota
    user.role = role
    if session_quota is not None:
        if user.session_quota_minutes != session_quota:
            user.session_used_seconds = 0
        user.session_quota_minutes = session_quota
    elif session_quota is None and ('session_quota_hours' in request.data or 'session_quota_days' in request.data or 'session_quota_minutes' in request.data):
        user.session_quota_minutes = None

    # Cost quota
    if cost_quota_raw is not None:
        try:
            user.cost_quota_usd = Decimal(str(cost_quota_raw)) if cost_quota_raw else None
        except (InvalidOperation, ValueError):
            pass

    # Feature flags
    has_document_converter = request.data.get('has_document_converter')
    if has_document_converter is not None:
        user.has_document_converter = bool(has_document_converter)

    user.save()

    # Update LLM permissions
    if llm_permissions:
        current_perms = set(
            UserLLMPermission.objects.filter(user=user)
            .values_list('llm_provider__name', flat=True)
        )
        desired_perms = set(llm_permissions)

        # Add new permissions — one query to resolve all new providers,
        # one bulk_create, instead of a LLMProvider.objects.get() per item.
        to_add = desired_perms - current_perms
        if to_add:
            new_providers = LLMProvider.objects.filter(name__in=to_add)
            UserLLMPermission.objects.bulk_create([
                UserLLMPermission(user=user, llm_provider=provider, granted_by=request.user)
                for provider in new_providers
            ])

        # Remove revoked permissions
        UserLLMPermission.objects.filter(
            user=user,
            llm_provider__name__in=current_perms - desired_perms,
        ).delete()

    log_audit_event(
        action='user_created' if created else 'user_updated',
        performed_by=request.user,
        action_target=user.username,
        description=f"{'Created' if created else 'Updated'} user {user.username} with role={role}",
        request=request,
    )

    return Response({
        'message': f"User {'created' if created else 'updated'} successfully",
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'ad_id': user.ad_id,
            'is_active': user.is_active,
            'session_quota_minutes': user.session_quota_minutes,
            'cost_quota_usd': str(user.cost_quota_usd) if user.cost_quota_usd is not None else None,
            'cost_used_usd': str(user.cost_used_usd),
        },
    })


@api_view(['PATCH', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
def admin_user_toggle(request, user_id):
    """Update or delete a user."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User, SessionLog

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    if request.method == 'DELETE':
        if user.pk == request.user.pk:
            return Response({'error': 'Cannot delete your own account'}, status=400)
        username = user.username
        user.delete()
        log_audit_event(
            action='user_deleted',
            performed_by=request.user,
            action_target=username,
            description=f"Deleted user {username}",
            request=request,
        )
        return Response({'message': f'User {username} deleted'})

    # PATCH
    data = request.data

    if 'is_active' in data:
        user.is_active = data['is_active']
    if 'role' in data:
        user.role = data['role']
    if 'has_document_converter' in data:
        user.has_document_converter = data['has_document_converter']

    session_quota = _normalize_session_quota_input(data)
    if session_quota is not None:
        if user.session_quota_minutes != session_quota:
            user.session_used_seconds = 0
        user.session_quota_minutes = session_quota
    elif session_quota is None and ('session_quota_hours' in data or 'session_quota_minutes' in data or 'session_quota_days' in data):
        # _normalize_session_quota_input returns None both when no quota keys
        # were sent AND when the total resolves to 0 (explicit "clear the
        # quota"). Since we already know at least one key is present here,
        # None can only mean the latter — so always clear, regardless of
        # which of the 3 fields carried the 0. (Previously this required
        # every field to be None, so `session_quota_minutes: 0` alone was
        # silently ignored instead of clearing the quota.)
        user.session_quota_minutes = None

    # Cost quota
    if 'cost_quota_usd' in data:
        raw = data['cost_quota_usd']
        try:
            user.cost_quota_usd = Decimal(str(raw)) if raw is not None and str(raw).strip() != '' else None
        except (InvalidOperation, ValueError):
            pass

    user.save()

    # Update LLM permissions
    if 'llm_permissions' in data:
        llm_permissions = data['llm_permissions']
        current_perms = set(
            UserLLMPermission.objects.filter(user=user)
            .values_list('llm_provider__name', flat=True)
        )
        desired_perms = set(llm_permissions)

        to_add = desired_perms - current_perms
        if to_add:
            new_providers = LLMProvider.objects.filter(name__in=to_add)
            UserLLMPermission.objects.bulk_create([
                UserLLMPermission(user=user, llm_provider=provider, granted_by=request.user)
                for provider in new_providers
            ])

        UserLLMPermission.objects.filter(
            user=user,
            llm_provider__name__in=current_perms - desired_perms,
        ).delete()

    # Update per-model quotas if provided
    if 'model_quotas' in data:
        for mq in data['model_quotas']:
            pid = mq.get('provider_id')
            quota_minutes = mq.get('quota_minutes')
            try:
                perm = UserLLMPermission.objects.get(
                    user=user, llm_provider_id=pid
                )
                if quota_minutes is not None:
                    perm.quota_minutes = quota_minutes
                else:
                    perm.quota_minutes = None
                perm.save()
            except UserLLMPermission.DoesNotExist:
                pass

    log_audit_event(
        action='user_updated',
        performed_by=request.user,
        action_target=user.username,
        description=f"Updated user {user.username}",
        request=request,
    )

    # Build response
    perms = UserLLMPermission.objects.filter(user=user).select_related('llm_provider')
    perm_names = [p.llm_provider.name for p in perms]
    model_quotas = []
    for p in perms:
        model_quotas.append({
            'provider_id': p.llm_provider.id,
            'provider_name': p.llm_provider.name,
            'provider_display_name': p.llm_provider.display_name,
            'quota_minutes': p.quota_minutes,
            'used_seconds': p.used_seconds,
            'remaining_seconds': p.get_remaining_seconds(),
            'is_active': p.is_active,
        })
    session_logs = SessionLog.objects.filter(user=user).order_by('-started_at')[:5]

    return Response({
        'message': 'User updated successfully',
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email or '',
            'role': user.role,
            'ad_id': user.ad_id,
            'is_active': user.is_active,
            'date_joined': user.date_joined.isoformat(),
            'llm_permissions': perm_names,
            'model_quotas': model_quotas,
            'session_quota_minutes': user.session_quota_minutes,
            'session_used_seconds': user.session_used_seconds,
            'session_remaining_seconds': user.get_session_remaining_seconds(),
            'session_started_at': user.session_started_at.isoformat() if user.session_started_at else None,
            'session_total_count': SessionLog.objects.filter(user=user).count(),
            'cost_quota_usd': str(user.cost_quota_usd) if user.cost_quota_usd is not None else None,
            'cost_used_usd': str(user.cost_used_usd) if user.cost_used_usd else '0',
            'has_document_converter': user.has_document_converter,
            'session_logs': [
                {
                    'id': sl.id,
                    'started_at': sl.started_at.isoformat(),
                    'ended_at': sl.ended_at.isoformat() if sl.ended_at else None,
                    'duration_seconds': sl.duration_seconds,
                }
                for sl in session_logs
            ],
        },
    })


# ===========================================================================
#  Admin — API Key Management (encrypted storage)
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def api_key_status(request):
    """List all providers with their API key status (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from .encryption import is_encryption_available, mask_api_key

    providers = LLMProvider.objects.all().order_by('sort_order', 'display_name')
    result = []
    for p in providers:
        key = p.get_api_key()
        result.append({
            'id': p.id,
            'name': p.name,
            'display_name': p.display_name,
            'provider_type': p.provider_type,
            'model_name': p.model_name,
            'api_key_source': p.get_api_key_source() if p.provider_type != 'ollama' else 'ollama',
            'api_key_env_var': p.api_key_env_var,
            'has_api_key': bool(key and key.strip()) if p.provider_type != 'ollama' else True,
            'api_key_preview': mask_api_key(key) if key and p.provider_type != 'ollama' else '',
            'is_active': p.is_active,
        })

    return Response({
        'encryption_available': is_encryption_available(),
        'providers': result,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def api_key_set(request, provider_id):
    """Encrypt and store an API key for a provider (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from .encryption import is_encryption_available

    if not is_encryption_available():
        return Response(
            {'error': 'Encryption not configured. Add ENCRYPTION_KEY to .env and restart.'},
            status=400,
        )

    try:
        provider = LLMProvider.objects.get(pk=provider_id)
    except LLMProvider.DoesNotExist:
        return Response({'error': 'Provider not found'}, status=404)

    api_key = request.data.get('api_key', '').strip()
    if not api_key:
        return Response({'error': 'api_key is required'}, status=400)

    try:
        provider.set_api_key(api_key)
    except RuntimeError as e:
        return Response({'error': str(e)}, status=400)

    log_audit_event(
        action='permission_granted',
        performed_by=request.user,
        action_target=provider.name,
        action_target_type='api_key',
        description=f"Set encrypted API key for provider: {provider.display_name}",
        request=request,
    )

    from .encryption import mask_api_key
    return Response({
        'message': f'API key set for {provider.display_name}',
        'api_key_source': 'db',
        'api_key_preview': mask_api_key(api_key),
    })


@api_view(['DELETE'])
@permission_classes([permissions.IsAuthenticated])
def api_key_delete(request, provider_id):
    """Remove the encrypted API key from DB for a provider (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    try:
        provider = LLMProvider.objects.get(pk=provider_id)
    except LLMProvider.DoesNotExist:
        return Response({'error': 'Provider not found'}, status=404)

    had_key = bool(provider.encrypted_api_key)
    provider.clear_api_key()

    if had_key:
        log_audit_event(
            action='permission_revoked',
            performed_by=request.user,
            action_target=provider.name,
            action_target_type='api_key',
            description=f"Removed encrypted API key for provider: {provider.display_name}",
            request=request,
        )

    # Check if env fallback exists
    source = provider.get_api_key_source()
    return Response({
        'message': f'Encrypted API key removed for {provider.display_name}',
        'api_key_source': source,
        'has_api_key': source != 'none',
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def api_key_verify(request, provider_id):
    """Test-verify that the API key works by making a minimal request (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    try:
        provider = LLMProvider.objects.get(pk=provider_id)
    except LLMProvider.DoesNotExist:
        return Response({'error': 'Provider not found'}, status=404)

    key = provider.get_api_key()
    if not key or not key.strip():
        return Response({'error': 'No API key configured for this provider'}, status=400)

    # Attempt a lightweight call to verify the key works
    try:
        from .llm_engine import call_llm
        result = call_llm(provider, [{'role': 'user', 'content': 'Say "ok"'}])
        return Response({
            'status': 'success',
            'message': f'API key verified — {provider.display_name} responded successfully',
        })
    except Exception as exc:
        return Response({
            'status': 'error',
            'message': f'Verification failed: {str(exc)}',
        }, status=400)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def api_key_migrate_from_env(request):
    """Migrate all existing .env API keys into encrypted DB storage (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from .encryption import is_encryption_available

    if not is_encryption_available():
        return Response(
            {'error': 'Encryption not configured. Add ENCRYPTION_KEY to .env and restart.'},
            status=400,
        )

    migrated = []
    skipped = []
    errors = []

    for provider in LLMProvider.objects.all():
        if provider.provider_type == 'ollama':
            skipped.append({'name': provider.name, 'reason': 'Ollama needs no key'})
            continue
        if provider.encrypted_api_key:
            skipped.append({'name': provider.name, 'reason': 'Already has DB key'})
            continue
        if not provider.api_key_env_var:
            skipped.append({'name': provider.name, 'reason': 'No env var configured'})
            continue

        from decouple import config
        env_key = config(provider.api_key_env_var, default='')
        if not env_key or not env_key.strip():
            skipped.append({'name': provider.name, 'reason': f'{provider.api_key_env_var} is empty'})
            continue

        try:
            provider.set_api_key(env_key)
            migrated.append(provider.name)
        except Exception as exc:
            errors.append({'name': provider.name, 'error': str(exc)})

    if migrated:
        log_audit_event(
            action='permission_granted',
            performed_by=request.user,
            action_target=', '.join(migrated),
            action_target_type='api_key',
            description=f"Migrated {len(migrated)} API key(s) from .env to encrypted DB storage",
            request=request,
        )

    return Response({
        'migrated': migrated,
        'skipped': skipped,
        'errors': errors,
        'message': f'Migrated {len(migrated)} key(s), skipped {len(skipped)}, errors {len(errors)}',
    })


# ===========================================================================
#  Admin — LLM Provider Management
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_llm_providers(request):
    """
    List LLM providers visible to the requesting user.
    Admins see all providers; regular users see only providers they have permission for.

    ?kind=chat (default) | image — image providers are admin-only config for
    Presentation mode's slide illustrations, never shown in the user-facing
    model picker.
    """
    kind = request.query_params.get('kind', 'chat')
    if kind not in ('chat', 'image'):
        kind = 'chat'

    if request.user.is_admin():
        providers = LLMProvider.objects.filter(provider_kind=kind)
        # Admin panel management views (edit/reactivate a disabled model) need
        # inactive providers too — only the chat model-picker itself (which
        # calls this endpoint without the flag) should stay active-only.
        if request.query_params.get('include_inactive') != 'true':
            providers = providers.filter(is_active=True)
        serializer = LLMProviderSerializer(providers, many=True)
    else:
        permitted_ids = UserLLMPermission.objects.filter(
            user=request.user, is_active=True,
        ).values_list('llm_provider_id', flat=True)
        providers = LLMProvider.objects.filter(id__in=permitted_ids, is_active=True, provider_kind=kind)
        serializer = LLMProviderListSerializer(providers, many=True)

    # Enrich with per-user quota info for non-admin
    data = serializer.data
    if not request.user.is_admin():
        perms = {
            p.llm_provider_id: p
            for p in UserLLMPermission.objects.filter(
                user=request.user, is_active=True
            ).select_related('llm_provider')
        }
        for item in data:
            perm = perms.get(item['id'])
            if perm:
                item['quota_remaining_seconds'] = perm.get_remaining_seconds()
                item['quota_total_seconds'] = (perm.quota_minutes * 60) if perm.quota_minutes else None
                item['used_seconds'] = perm.used_seconds
            else:
                item['quota_remaining_seconds'] = None
                item['quota_total_seconds'] = None
                item['used_seconds'] = 0

    return Response(data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def create_llm_provider(request):
    """Create a new LLM provider (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    serializer = LLMProviderCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    provider = serializer.save()

    log_audit_event(
        action='permission_granted',
        performed_by=request.user,
        action_target=provider.name,
        action_target_type='permission',
        description=f"Created LLM provider: {provider.display_name}",
        request=request,
    )

    return Response(LLMProviderSerializer(provider).data, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
def update_llm_provider(request, provider_id):
    """Update or delete an LLM provider (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    try:
        provider = LLMProvider.objects.get(pk=provider_id)
    except LLMProvider.DoesNotExist:
        return Response({'error': 'Provider not found'}, status=404)

    if request.method == 'DELETE':
        name = provider.name
        provider.delete()
        log_audit_event(
            action='permission_revoked',
            performed_by=request.user,
            action_target=name,
            action_target_type='permission',
            description=f"Deleted LLM provider: {name}",
            request=request,
        )
        return Response({'message': f'Provider {name} deleted'})

    serializer = LLMProviderCreateSerializer(provider, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    # Only one provider of a given kind may be "default" at a time — clear it
    # from any other row first, since the model has no DB-level uniqueness
    # constraint enforcing that on its own.
    if serializer.validated_data.get('is_default') is True:
        LLMProvider.objects.filter(
            provider_kind=provider.provider_kind, is_default=True
        ).exclude(pk=provider.pk).update(is_default=False)

    serializer.save()
    return Response(LLMProviderSerializer(provider).data)


# ===========================================================================
#  Admin — User Permission Management
# ===========================================================================

@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def manage_user_permissions(request, user_id):
    """Get or set per-model permissions for a user."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import User
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    if request.method == 'GET':
        perms = UserLLMPermission.objects.filter(user=user).select_related('llm_provider')
        return Response(UserLLMPermissionSerializer(perms, many=True).data)

    # POST — update permissions
    permissions_data = request.data.get('permissions', [])
    for perm_data in permissions_data:
        provider_id = perm_data.get('llm_provider')
        try:
            provider = LLMProvider.objects.get(pk=provider_id)
        except LLMProvider.DoesNotExist:
            continue

        perm, created = UserLLMPermission.objects.get_or_create(
            user=user, llm_provider=provider,
            defaults={'granted_by': request.user},
        )

        if 'quota_minutes' in perm_data:
            perm.quota_minutes = perm_data['quota_minutes']
        if 'is_active' in perm_data:
            perm.is_active = perm_data['is_active']
        if 'expires_at' in perm_data:
            perm.expires_at = perm_data['expires_at']
        if 'reset_usage' in perm_data and perm_data['reset_usage']:
            perm.used_seconds = 0
        perm.save()

    perms = UserLLMPermission.objects.filter(user=user).select_related('llm_provider')
    return Response(UserLLMPermissionSerializer(perms, many=True).data)


# ===========================================================================
#  Conversations
# ===========================================================================

class ConversationListView(generics.ListCreateAPIView):
    """List conversations for the current user, or create a new one."""
    permission_classes = [permissions.IsAuthenticated]
    # The frontend consumes this as a plain array (see Frontend/src/lib/api.ts
    # getConversations()) — opt out of the new project-wide
    # DEFAULT_PAGINATION_CLASS to avoid changing this response shape.
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ConversationCreateSerializer
        return ConversationListSerializer

    def get_queryset(self):
        # Manual offset/limit (default limit 200 preserves the old hard
        # truncation for existing callers) so older conversations past #200
        # are reachable via ?offset=200 instead of being permanently hidden.
        try:
            limit = min(int(self.request.query_params.get('limit', 200)), 200)
        except (ValueError, TypeError):
            limit = 200
        try:
            offset = int(self.request.query_params.get('offset', 0))
        except (ValueError, TypeError):
            offset = 0

        return Conversation.objects.filter(
            user=self.request.user, is_active=True
        ).select_related('llm_provider').annotate(
            annotated_message_count=Count('messages')
        ).order_by('-updated_at')[offset:offset + limit]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider_id = serializer.validated_data.get('llm_provider')
        provider = None
        if provider_id:
            try:
                provider = LLMProvider.objects.get(pk=provider_id)
            except LLMProvider.DoesNotExist:
                pass

        project_id = serializer.validated_data.get('project')
        project = None
        if project_id:
            project = Project.objects.filter(pk=project_id, user=request.user).first()

        conversation = Conversation.objects.create(
            user=request.user,
            title=serializer.validated_data.get('title', 'New Chat'),
            llm_provider=provider,
            project=project,
            chat_mode=serializer.validated_data.get('chat_mode', 'general'),
        )
        return Response(
            ConversationListSerializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )


class ConversationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Get, update, or soft-delete a conversation."""
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Prefetch
        recent_msgs = Message.objects.order_by('-created_at')[:200]
        return Conversation.objects.filter(
            user=self.request.user
        ).select_related('llm_provider').prefetch_related(
            Prefetch('messages', queryset=recent_msgs, to_attr='_recent_messages')
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


# ===========================================================================
#  Projects & Saved Prompts — sidebar organization
# ===========================================================================

class ProjectListView(generics.ListCreateAPIView):
    """List the current user's projects, or create a new one."""
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Frontend expects a plain array (getProjects()) — opt out of the new
    # project-wide DEFAULT_PAGINATION_CLASS.
    pagination_class = None

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ProjectDetailView(generics.DestroyAPIView):
    """Delete a project (conversations are kept, just un-grouped)."""
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)


class SavedPromptListView(generics.ListCreateAPIView):
    """List the current user's saved prompts, or create a new one."""
    serializer_class = SavedPromptSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Frontend expects a plain array (getSavedPrompts()) — opt out of the new
    # project-wide DEFAULT_PAGINATION_CLASS.
    pagination_class = None

    def get_queryset(self):
        return SavedPrompt.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SavedPromptDetailView(generics.DestroyAPIView):
    """Delete a saved prompt."""
    serializer_class = SavedPromptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SavedPrompt.objects.filter(user=self.request.user)


# ===========================================================================
#  Chat — Main Endpoint
# ===========================================================================

class ChatView(APIView):
    """
    Main chat endpoint. Accepts a message, resolves the provider from DB,
    checks per-model quota, calls the universal LLM engine, and tracks usage.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        user = request.user
        message_text = serializer.validated_data['message']
        conversation_id = serializer.validated_data.get('conversation_id')
        chat_mode = serializer.validated_data.get('chat_mode', 'general')
        document_ids = serializer.validated_data.get('document_ids', [])
        presentation_theme = serializer.validated_data.get('presentation_theme', '')
        # 0/None means "let the model decide based on content" — only override
        # when the user explicitly picked a count (see PresentationControls.tsx).
        slide_count = serializer.validated_data.get('slide_count', 0)

        # --- Resolve LLM provider ---
        provider = self._resolve_provider(serializer.validated_data)
        if provider is None:
            return Response({'error': 'LLM provider not found or inactive'}, status=400)

        # --- Check session quota ---
        if user.session_quota_minutes and user.is_session_quota_exceeded():
            return Response({'error': 'Session quota exceeded'}, status=403)

        # --- Check per-model quota ---
        # Superusers/admins bypass permission checks
        permission = None
        if not user.is_admin() and not user.is_superuser:
            with transaction.atomic():
                permission = UserLLMPermission.objects.filter(
                    user=user, llm_provider=provider, is_active=True,
                ).select_for_update().first()

                if not permission or not permission.is_usable():
                    reason = 'No access to this model'
                    if permission and permission.is_quota_exceeded():
                        reason = 'Model quota exceeded'
                    elif permission and permission.is_expired():
                        reason = 'Permission expired'
                    return Response({'error': reason}, status=403)

                # Reserve a nominal 1 second now, while still holding the row lock —
                # closes the check-then-act race where two concurrent requests could
                # both read "under quota" before either recorded usage. The actual
                # duration is trued up (minus this reservation) once the LLM call
                # completes, at the record-usage site below.
                permission.record_usage(1)

        # --- Get or create conversation ---
        conversation = self._get_or_create_conversation(
            user, conversation_id, provider, chat_mode,
            project_id=serializer.validated_data.get('project_id'),
        )

        # --- Save user message ---
        user_msg = Message.objects.create(
            conversation=conversation,
            role='user',
            content=message_text,
            llm_provider=provider,
            token_count=self._estimate_tokens(message_text),
        )

        # --- Build messages for LLM ---
        document_context = self._get_document_context(document_ids, user)
        if chat_mode == 'knowledge':
            from .services.rag import knowledge_context
            document_context, knowledge_sources = knowledge_context(user, message_text)
        effective_mode = chat_mode
        if chat_mode == 'general':
            detected = detect_intent(message_text)
            if detected:
                effective_mode = detected
        system_prompt = get_system_prompt(provider, effective_mode, document_context)
        if chat_mode == 'presentation' and slide_count:
            system_prompt += f"\n\nIMPORTANT: Generate exactly {slide_count} slides total."
        if chat_mode == 'presentation' and presentation_theme:
            system_prompt += f"\n\nUse theme: \"{presentation_theme}\" in the JSON response."
        try:
            messages = self._build_messages(conversation, system_prompt, provider)
        except ValueError as exc:
            self._refund_reservation(permission)
            return Response({'error': str(exc)}, status=400)

        # --- Call LLM via queue ---
        # Presentation mode gets a much larger completion budget than the
        # provider's normal chat max_tokens: reasoning models (e.g. gpt-5-mini)
        # spend part of that budget on hidden reasoning tokens before ever
        # emitting visible output, and a detailed multi-slide JSON deck can
        # easily need several thousand tokens on its own — the default budget
        # was observed to be silently exhausted by reasoning alone, returning
        # empty content with no error.
        llm_kwargs = {'max_tokens': 8000} if chat_mode == 'presentation' else {}
        if chat_mode not in ('knowledge', 'presentation'):
            llm_kwargs['web_user'] = user
        try:
            result = llm_request_queue.submit(call_llm, provider, messages, **llm_kwargs)
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            self._refund_reservation(permission)
            from .services.provider_errors import chat_error
            message, status_code = chat_error(e, provider)
            return Response({'error': message}, status=status_code)

        # --- Save assistant message ---
        ai_content = result.get('content', '')
        ai_msg = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=ai_content,
            llm_provider=provider,
            token_count=self._estimate_tokens(ai_content),
        )

        # --- Generate PPTX for presentation mode ---
        # Rendering the deck (python-pptx) can take seconds — enqueued on the
        # "documents" Celery queue instead of running inline, so it no longer
        # holds one of the (small number of) request-handling slots. The
        # client polls GET /api/admin/messages/<id>/pptx-status/ for the
        # result; pptx_url stays empty until the task completes.
        pptx_url = None
        style_suggestions = None
        pptx_theme = None
        pptx_status = None
        if chat_mode == 'presentation' and ai_content:
            try:
                pptx_theme, style_suggestions = extract_presentation_metadata(ai_content)
                # User-chosen theme overrides the LLM-suggested theme
                effective_theme = presentation_theme or pptx_theme
                slides = parse_llm_slides(ai_content)
                if slides:
                    pptx_theme = effective_theme or pptx_theme
                    pptx_status = 'processing'
                    ai_msg.pptx_status = pptx_status
                    ai_msg.pptx_theme = pptx_theme or ''
                    ai_msg.style_suggestions = style_suggestions or []
                    ai_msg.save(update_fields=['pptx_status', 'pptx_theme', 'style_suggestions'])
                    generate_pptx_task.delay(ai_msg.id, slides, message_text[:50], pptx_theme)
                    logger.info("Enqueued PPTX generation for message %s (%d slides, theme=%s)",
                                ai_msg.id, len(slides), pptx_theme)
                else:
                    logger.warning("No slides parsed from LLM response for presentation mode")
            except Exception as e:
                logger.error("Failed to enqueue PPTX generation: %s", e)

        # --- Record usage ---
        # 1 second was already reserved at the quota-check gate above (closes the
        # concurrent-request race) — true up the remainder here instead of
        # double-counting that reservation.
        duration_seconds = (result.get('latency_ms', 0) or 0) / 1000.0
        if permission:
            permission.record_usage(max(0, int(duration_seconds) - 1))

        # Log token usage
        self._log_usage(user, provider, result)

        # Persist the first-exchange title before the client refreshes its sidebar.
        ensure_title(conversation, ai_content)

        # --- Auto-summarize in background (avoid blocking the response) ---
        summarize_conversation_task.delay(conversation.id, provider.id)

        # Build response
        response_data = {
            'response': ai_content,
            'conversation_id': conversation.id,
            'message_id': ai_msg.id,
            'token_count': result.get('usage', {}).get('total_tokens', 0),
            'summarized': False,
            'pptx_url': pptx_url,
            'style_suggestions': style_suggestions,
            'pptx_theme': pptx_theme,
            'pptx_status': pptx_status,
        }

        # Include quota info
        if permission:
            permission.refresh_from_db()
            response_data['quota_remaining_seconds'] = permission.get_remaining_seconds()
        else:
            response_data['quota_remaining_seconds'] = None

        return Response(response_data)

    # -----------------------------------------------------------------------
    #  Helpers
    # -----------------------------------------------------------------------

    @timed('provider_lookup')
    def _resolve_provider(self, data):
        """Resolve LLMProvider from request data (by ID or name)."""
        provider_id = data.get('llm_provider_id')
        provider_name = data.get('llm_provider')

        if provider_id:
            return LLMProvider.objects.filter(pk=provider_id, is_active=True).first()
        if provider_name:
            return LLMProvider.objects.filter(name=provider_name, is_active=True).first()

        # Fallback to default (chat only — image providers are never chat-selectable)
        return LLMProvider.objects.filter(is_default=True, is_active=True, provider_kind='chat').first()

    def _get_or_create_conversation(self, user, conversation_id, provider, chat_mode, project_id=None):
        if conversation_id:
            try:
                conv = Conversation.objects.get(pk=conversation_id, user=user)
                # Update provider if different
                if conv.llm_provider != provider:
                    conv.llm_provider = provider
                    conv.save(update_fields=['llm_provider'])
                if conv.chat_mode != chat_mode:
                    conv.chat_mode = chat_mode
                    conv.save(update_fields=['chat_mode'])
                return conv
            except Conversation.DoesNotExist:
                pass

        project = Project.objects.filter(pk=project_id, user=user).first() if project_id else None
        return Conversation.objects.create(
            user=user,
            title='New Chat',
            llm_provider=provider,
            chat_mode=chat_mode,
            project=project,
        )

    # No chunking/embeddings/retrieval — the whole extracted text is dumped into the
    # prompt every turn. This cap is just a safety net against blowing the context
    # window or cost on a huge file, not real retrieval.
    _MAX_DOCUMENT_CONTEXT_CHARS = 40000

    @timed('documents')
    def _get_document_context(self, document_ids, user):
        """Gather extracted text from attached documents."""
        if not document_ids:
            return None

        from django.db.models.functions import Substr, Right, Length
        owned = Document.objects.filter(
            id__in=document_ids,
            user=user,
            extraction_status='completed',
        ).order_by('pk')
        docs = list(owned.values('pk', 'original_filename')[:10])
        keys = {d['pk']: f'document-text:{user.pk}:{d["pk"]}' for d in docs}
        cached = cache.get_many(keys.values())
        missing = [pk for pk, key in keys.items() if key not in cached]
        additions = {}
        for doc in owned.filter(pk__in=missing).annotate(
            head=Substr('extracted_text', 1, self._MAX_DOCUMENT_CONTEXT_CHARS),
            tail=Right('extracted_text', 16000), text_length=Length('extracted_text')
        ).values('pk', 'head', 'tail', 'text_length'):
            content = doc['head']
            if doc['text_length'] > self._MAX_DOCUMENT_CONTEXT_CHARS:
                content = content[:24000] + '\n[Middle omitted: document exceeds context limit.]\n' + doc['tail']
            additions[keys[doc['pk']]] = content
        if additions:
            cache.set_many(additions, timeout=300)
            cached.update(additions)
        texts = [f"Source: {d['original_filename']}\n{cached[keys[d['pk']]]}"
                 for d in docs if cached.get(keys[d['pk']])]
        if not texts:
            return None
        combined = '\n\n---\n\n'.join(texts)

        limit = self._MAX_DOCUMENT_CONTEXT_CHARS
        if len(combined) > limit:
            head = combined[:int(limit * 0.6)]
            tail = combined[-int(limit * 0.4):]
            combined = (
                f"{head}\n\n"
                f"[...{len(combined) - limit:,} characters omitted here — the document(s) exceeded "
                f"the context budget, so only the beginning and end are shown...]\n\n"
                f"{tail}"
            )
        return combined

    @staticmethod
    def _estimate_tokens(text):
        return int(len(text.split()) * 1.3)

    @staticmethod
    def _refund_reservation(permission):
        """Undo the nominal 1-second quota reservation taken at the quota-check
        gate when the LLM call never completes (queue full, provider error,
        timeout, etc.) — otherwise every failed request permanently over-counts
        the user's usage by 1 second even though nothing was actually used."""
        if permission:
            permission.record_usage(-1)

    def _build_messages(self, conversation, system_prompt, current_provider=None):
        from .conversation_context import build_context
        return build_context(conversation, system_prompt, current_provider)

    def _estimate_cost(self, provider, prompt_tokens, completion_tokens, cached_tokens=0):
        # input_cost_per_1m/output_cost_per_1m are stored as float (admin-configured
        # rates, not an accumulated ledger, so storage-level float imprecision is
        # bounded) — but the multiply-and-sum below used to happen in float space
        # entirely before a cosmetic `Decimal(str(cost))` wrap at the call site,
        # which masked rather than fixed the rounding error. Converting the rates to
        # Decimal *before* any arithmetic keeps the actual computation exact.
        input_rate = Decimal(str(provider.input_cost_per_1m))
        output_rate = Decimal(str(provider.output_cost_per_1m))
        cached_rate = Decimal(str(provider.cached_input_cost_per_1m or 0))
        # cached_tokens is a subset of prompt_tokens (the portion served from the
        # provider's cache at a discounted rate), not additional tokens — billing
        # it again at the full input rate would double-count and over-report cost.
        uncached_prompt_tokens = max(0, prompt_tokens - cached_tokens)
        cost = (
            (Decimal(uncached_prompt_tokens) * input_rate
             + Decimal(cached_tokens) * cached_rate
             + Decimal(completion_tokens) * output_rate)
            / Decimal(1_000_000)
        )
        return cost.quantize(Decimal('0.000001'))

    # ------------------------------------------------------------------
    @timed('usage_write')
    def _log_usage(self, user, provider, result):
        """Log LLM usage synchronously to ensure data integrity."""
        usage = result.get('usage', {})
        prompt_tokens = usage.get('prompt_tokens', 0)
        cached_tokens = usage.get('cached_tokens', 0)
        completion_tokens = usage.get('completion_tokens', 0)
        total_tokens = usage.get('total_tokens', 0)
        cost = self._estimate_cost(provider, prompt_tokens, completion_tokens, cached_tokens)

        try:
            LLMUsageLog.objects.create(
                user=user,
                llm_provider=provider,
                provider=provider.provider_type,
                model=result.get('model', provider.model_name),
                prompt_tokens=prompt_tokens,
                cached_tokens=cached_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_usd=cost,
                latency_ms=result.get('latency_ms'),
            )
            # Increment user cost tracker — `cost` is already a Decimal computed
            # entirely in Decimal space by _estimate_cost, so no float round-trip here.
            if cost > 0:
                from accounts.models import User as UserModel
                UserModel.objects.filter(pk=user.pk).update(
                    cost_used_usd=F('cost_used_usd') + cost
                )
        except Exception as e:
            logger.error(f"Failed to log usage: {e}")

    def _maybe_summarize(self, conversation, provider):
        if conversation.chat_mode == 'knowledge':
            return False
        from .conversation_context import summarize_context
        return summarize_context(conversation, provider, call_llm)

    def _maybe_update_memory(self, conversation, provider):
        """Extract durable facts about the user from this conversation into
        their long_term_memory, so future conversations — even different ones —
        can recall context across chat sessions when the user explicitly asks
        for remembered information (see `_build_messages`).

        Runs every N messages rather than on a token threshold like
        `_maybe_summarize`: memory-worthy facts (name, role, ongoing projects,
        preferences) tend to show up early and sparsely, not in proportion to
        conversation length. N=2 (every exchange) rather than something larger —
        a self-introduction is very often the entire conversation (2 messages
        total), so a bigger N would miss the single most common case.
        """
        if conversation.chat_mode == 'knowledge':
            return False
        every_n_messages = 2
        msg_count = conversation.messages.count()
        if msg_count == 0 or msg_count % every_n_messages != 0:
            return False

        lock_key = f'memory-lock-{conversation.id}-{msg_count}'
        if not cache.add(lock_key, 1, timeout=120):
            return False

        try:
            user = conversation.user
            recent = list(conversation.messages.order_by('-created_at')[:every_n_messages])
            transcript = '\n'.join(f"{m.role}: {m.content}" for m in reversed(recent))
            existing_memory = user.long_term_memory or ''

            memory_prompt = [
                {'role': 'system', 'content': (
                    'You maintain a long-term memory profile about a user, built up across all '
                    'of their conversations with an AI assistant. Given the existing memory and a '
                    'new excerpt of conversation, output an UPDATED memory: durable facts, '
                    'preferences, ongoing projects, and context worth recalling in future, unrelated '
                    'conversations. Merge with the existing memory, drop anything stale or no longer '
                    'true, avoid duplicates, and keep it to at most 15 short bullet points. Do not '
                    'include transient details (a one-off question, a single task) — only lasting '
                    'facts about the user. Output ONLY the bullet list, nothing else. If nothing '
                    'durable is worth keeping from the new excerpt, output the existing memory '
                    'unchanged verbatim.'
                )},
                {'role': 'user', 'content': (
                    f"Existing memory:\n{existing_memory or '(none yet)'}\n\n"
                    f"New conversation excerpt:\n{transcript}"
                )},
            ]
            result = call_llm(provider, memory_prompt, max_tokens=400)
            memory_text = result.get('content', '').strip()

            if memory_text and memory_text != existing_memory:
                user.long_term_memory = memory_text
                user.save(update_fields=['long_term_memory'])
                return True
            return False
        except Exception as e:
            logger.error(f"Memory update failed: {e}")
            return False
        finally:
            cache.delete(lock_key)


# ===========================================================================
#  Chat — Streaming Endpoint (SSE)
# ===========================================================================

class ChatStreamView(ChatView):
    """
    Server-Sent Events streaming variant of ChatView.
    Returns tokens as they arrive from the LLM instead of buffering the full
    response. Post-processing (usage logging, auto-title, summarize) runs in a
    background thread so the HTTP response is not delayed.

    SSE event types:
      event: token  data: {"text": "<chunk>"}
      event: done   data: {"conversation_id": <id>, "token_count": <n>}
      event: error  data: {"error": "<message>"}
    """

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        user = request.user
        message_text = serializer.validated_data['message']
        conversation_id = serializer.validated_data.get('conversation_id')
        chat_mode = serializer.validated_data.get('chat_mode', 'general')
        document_ids = serializer.validated_data.get('document_ids', [])

        # Presentation mode can't stream (whole JSON must be parsed at once)
        if chat_mode == 'presentation':
            return super().post(request)

        provider = self._resolve_provider(serializer.validated_data)
        if provider is None:
            return Response({'error': 'LLM provider not found or inactive'}, status=400)

        if user.session_quota_minutes and user.is_session_quota_exceeded():
            return Response({'error': 'Session quota exceeded'}, status=403)

        permission = None
        if not user.is_admin() and not user.is_superuser:
            with transaction.atomic():
                permission = UserLLMPermission.objects.filter(
                    user=user, llm_provider=provider, is_active=True,
                ).select_for_update().first()

                if not permission or not permission.is_usable():
                    reason = 'No access to this model'
                    if permission and permission.is_quota_exceeded():
                        reason = 'Model quota exceeded'
                    elif permission and permission.is_expired():
                        reason = 'Permission expired'
                    return Response({'error': reason}, status=403)

                # See ChatView.post for why this reservation exists.
                permission.record_usage(1)

        conversation = self._get_or_create_conversation(
            user, conversation_id, provider, chat_mode,
            project_id=serializer.validated_data.get('project_id'),
        )
        Message.objects.create(
            conversation=conversation,
            role='user',
            content=message_text,
            llm_provider=provider,
            token_count=self._estimate_tokens(message_text),
        )

        document_context = self._get_document_context(document_ids, user)
        if chat_mode == 'knowledge':
            from .services.rag import knowledge_context
            document_context, knowledge_sources = knowledge_context(user, message_text)
        effective_mode = chat_mode
        if chat_mode == 'general':
            detected = detect_intent(message_text)
            if detected:
                effective_mode = detected
        # Detected independent of chat_mode/effective_mode — a user can ask
        # "give me this as a word doc" from General, Document, or Research
        # mode alike. The reply itself is generated normally (with a short
        # system-prompt nudge so the LLM doesn't claim it can't make files);
        # only after streaming finishes does chat_stream_post_process_task
        # actually render it.
        export_format = detect_export_format(message_text)
        if export_format == UNSPECIFIED_FORMAT:
            # "give me that too" / "i need download link" — wants a file but
            # never named a format. Reuse whatever this conversation last
            # exported as; only default to docx when there's no history to
            # go on (a brand-new "download link" ask in a fresh conversation).
            export_format = conversation.last_export_format or 'docx'

        # "Pure export" — the message only asks to turn the *previous* reply
        # into a file ("i want this in a pdf"), with no new content to write.
        # Reuse the last assistant message and skip the LLM entirely instead
        # of regenerating identical text (the user was — rightly — annoyed
        # that a follow-up "give me this as a doc" burned tokens re-writing
        # the whole answer). Falls through to normal generation if there's no
        # prior reply to reuse.
        if export_format and is_pure_export_request(message_text, export_format):
            # Skip past any earlier export-ack messages — otherwise a second
            # "download link" ask would re-export the previous ack's own
            # placeholder text ("Here's your Word document…") instead of the
            # real content, and every further ask would compound the same way.
            prev = conversation.messages.filter(
                role='assistant', is_export_ack=False
            ).order_by('-created_at').first()
            if prev and prev.content.strip():
                return self._stream_pure_export(
                    conversation, provider, user, message_text, export_format,
                    prev.content, permission,
                )

        system_prompt = get_system_prompt(provider, effective_mode, document_context, export_format)
        try:
            messages = self._build_messages(conversation, system_prompt, provider)
        except ValueError as exc:
            self._refund_reservation(permission)
            return Response({'error': str(exc)}, status=400)

        # Capture locals for the generator closure
        _user = user
        _provider = provider
        _permission = permission
        _conversation = conversation
        _message_text = message_text
        _export_format = export_format

        def generate():
            content_parts = []
            final_result = None

            # Gate streaming through the same concurrency budget as the
            # non-streaming path (llm_request_queue) instead of calling
            # stream_llm() directly and unbounded. Previously this was the
            # one LLM call path with no cap and no timeout at all.
            if not llm_request_queue.acquire_stream_slot(timeout=150):
                logger.error("Streaming LLM request queue is full (conversation=%s)", _conversation.id)
                self._refund_reservation(_permission)
                yield f"event: error\ndata: {json.dumps({'error': 'The AI model is busy. Please try again shortly.'})}\n\n"
                return

            stream_start = time.monotonic()
            try:
                for item in stream_llm(_provider, messages, web_user=_user if chat_mode != 'knowledge' else None):
                    if time.monotonic() - stream_start > llm_request_queue.stream_timeout:
                        raise TimeoutError(
                            f"LLM stream exceeded {llm_request_queue.stream_timeout}s timeout"
                        )
                    if isinstance(item, str) and item:
                        content_parts.append(item)
                        yield f"event: token\ndata: {json.dumps({'text': item})}\n\n"
                    elif isinstance(item, dict) and item.get('event'):
                        yield f"event: {item['event']}\ndata: {json.dumps(item)}\n\n"
                    elif isinstance(item, dict):
                        final_result = item
            except Exception as exc:
                logger.exception("Streaming LLM error")
                # The stream never reached the post-process task that would
                # normally true up the 1-second reservation taken before
                # streaming started — refund it here instead of leaving the
                # user permanently over-charged for a request that failed.
                self._refund_reservation(_permission)
                from .services.provider_errors import chat_error
                message, status_code = chat_error(exc, _provider)
                yield f"event: error\ndata: {json.dumps({'error': message, 'status': status_code})}\n\n"
                return
            finally:
                llm_request_queue.release_stream_slot()

            ai_content = ''.join(content_parts)

            token_count = 0
            if final_result:
                token_count = final_result.get('usage', {}).get('total_tokens', 0)

            title = ensure_title(_conversation, ai_content)
            # Persist the completed answer before reporting completion. The next
            # turn must not race Celery and lose its immediate assistant context.
            ai_msg = Message.objects.create(conversation=_conversation, role='assistant',
                content=ai_content, llm_provider=_provider, token_count=self._estimate_tokens(ai_content),
                export_status='processing' if _export_format else '', export_file_type=_export_format or '')

            # Post-processing (save AI message, usage logging, auto-title,
            # auto-summarize) runs as a Celery task on the "chat_post" queue
            # instead of an unmanaged thread — this runs after the done event
            # is already sent, so the user sees the response complete
            # instantly, but the DB connection lifecycle is now owned by a
            # Celery worker process instead of leaking outside Django's
            # request/response cycle.
            chat_stream_post_process_task.delay(
                _conversation.id, _provider.id, _user.id, ai_content, final_result,
                _permission.id if _permission else None, _message_text, _export_format,
                message_id=ai_msg.pk,
            )
            yield f"event: done\ndata: {json.dumps({'conversation_id': _conversation.id, 'message_id': ai_msg.pk, 'title': title, 'token_count': token_count, 'export_format': _export_format})}\n\n"

        resp = StreamingHttpResponse(generate(), content_type='text/event-stream')
        resp['X-Accel-Buffering'] = 'no'
        resp['Cache-Control'] = 'no-cache'
        return resp

    # Labels used in the acknowledgment shown when reusing a prior reply.
    _EXPORT_LABELS = {
        'docx': 'Word document', 'pdf': 'PDF', 'xlsx': 'Excel spreadsheet',
        'pptx': 'PowerPoint presentation', 'csv': 'CSV file', 'md': 'Markdown file',
    }

    def _stream_pure_export(self, conversation, provider, user, message_text,
                            export_format, source_content, permission):
        """Handle a 'give me my last reply as a file' request WITHOUT calling
        the LLM: stream a short acknowledgment, then render the previous
        reply's existing text into the requested file. Uses the same SSE shape
        as generate() so the frontend's onDone/poll flow is unchanged."""
        # No model call happens here, so give back the 1-second slot that the
        # quota gate reserved up front.
        self._refund_reservation(permission)

        label = self._EXPORT_LABELS.get(export_format, 'file')
        ack = f"Here's your {label}, generated from my previous response — download it below."

        _conversation = conversation
        _provider = provider
        _user = user
        _message_text = message_text
        _export_format = export_format
        _source = source_content

        def generate():
            # Stream the ack word-by-word so it renders like a normal reply.
            for word in ack.split(' '):
                yield f"event: token\ndata: {json.dumps({'text': word + ' '})}\n\n"
            yield f"event: done\ndata: {json.dumps({'conversation_id': _conversation.id, 'token_count': 0, 'export_format': _export_format})}\n\n"
            # final_result=None + export_source_content set => the task renders
            # the file from the previous reply and skips all LLM follow-ups.
            # is_export_ack=True marks this new Message so a LATER pure export
            # skips past it and finds the real content instead of this ack.
            chat_stream_post_process_task.delay(
                _conversation.id, _provider.id, _user.id, ack, None,
                None, _message_text, _export_format, _source, True,
            )

        resp = StreamingHttpResponse(generate(), content_type='text/event-stream')
        resp['X-Accel-Buffering'] = 'no'
        resp['Cache-Control'] = 'no-cache'
        return resp


# ===========================================================================
#  Retheme — Re-generate PPTX with a different theme
# ===========================================================================

class RethemeView(APIView):
    """Re-generate a PPTX presentation with a new theme, updating the message."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        message_id = request.data.get('message_id')
        new_theme = request.data.get('theme', '')
        if not message_id:
            return Response({'error': 'message_id required'}, status=400)
        try:
            msg = Message.objects.get(id=message_id, conversation__user=request.user)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=404)

        slides = parse_llm_slides(msg.content)
        if not slides:
            return Response({'error': 'No slide data found in this message'}, status=400)

        try:
            rel_path = generate_pptx(slides, title='Presentation', theme=new_theme)
            pptx_url = request.build_absolute_uri(f"{settings.MEDIA_URL}{rel_path}")
            msg.pptx_url = pptx_url
            msg.pptx_theme = new_theme or ''
            msg.save(update_fields=['pptx_url', 'pptx_theme'])
            return Response({'pptx_url': pptx_url, 'pptx_theme': new_theme or ''})
        except Exception as e:
            logger.error("Retheme failed: %s", e)
            return Response({'error': 'Failed to generate presentation'}, status=500)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def message_pptx_status(request, message_id):
    """Poll target for the async PPTX generation task kicked off by ChatView.post.
    Returns pptx_status ('processing'/'completed'/'failed') plus the URL once ready."""
    try:
        msg = Message.objects.get(id=message_id, conversation__user=request.user)
    except Message.DoesNotExist:
        return Response({'error': 'Message not found'}, status=404)

    return Response({
        'message_id': msg.id,
        'pptx_status': msg.pptx_status,
        'pptx_url': msg.pptx_url,
        'pptx_theme': msg.pptx_theme,
        'pptx_error': msg.pptx_error,
        'style_suggestions': msg.style_suggestions,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def conversation_export_status(request, conversation_id):
    """Poll target for the inline file-export kicked off by
    chat_stream_post_process_task. The streaming path doesn't learn the new
    assistant message's id until after it's created asynchronously, so this
    is keyed by conversation instead of message — the frontend just asks for
    the latest assistant message's export state after seeing 'export_format'
    on the SSE 'done' event."""
    try:
        conversation = Conversation.objects.get(id=conversation_id, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=404)

    msg = conversation.messages.filter(role='assistant').order_by('-created_at').first()
    if not msg:
        return Response({'export_status': ''})

    return Response({
        'message_id': msg.id,
        'export_status': msg.export_status,
        'export_file_url': msg.export_file_url,
        'export_file_type': msg.export_file_type,
        'export_error': msg.export_error,
    })


_DIRECT_EXPORT_FORMATS = {'docx', 'pdf', 'xlsx', 'pptx', 'csv', 'md'}


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def export_message_direct(request, message_id):
    """Explicit 'Export as...' button on a message — no phrase detection
    needed, the user already picked a format. Renders synchronously: all six
    formats complete in well under a second for a typical chat-reply length
    (proven — none involve a network call), so there's no reason to make the
    user wait through the async Celery + polling dance the auto-detected
    chat-phrase path needs (that path defers because the LLM call and the
    file's own message row aren't ready yet at request time; here they
    already are)."""
    file_type = request.data.get('file_type')
    if file_type not in _DIRECT_EXPORT_FORMATS:
        return Response({'error': f'Unsupported file_type: {file_type!r}'}, status=400)

    try:
        msg = Message.objects.get(id=message_id, conversation__user=request.user, role='assistant')
    except Message.DoesNotExist:
        return Response({'error': 'Message not found'}, status=404)

    if not msg.content.strip():
        return Response({'error': 'This message has no content to export'}, status=400)

    conversation = msg.conversation
    title = conversation.title if conversation.title not in ('New Chat', '') else 'Response'

    try:
        rel_path = generate_export(file_type, msg.content, title)
        msg.export_file_url = f"{settings.BACKEND_PUBLIC_URL}{settings.MEDIA_URL}{rel_path}"
        msg.export_file_type = file_type
        msg.export_status = 'completed'
        msg.export_error = ''
        msg.save(update_fields=['export_file_url', 'export_file_type', 'export_status', 'export_error'])
        if conversation.last_export_format != file_type:
            conversation.last_export_format = file_type
            conversation.save(update_fields=['last_export_format'])
    except Exception as e:
        logger.exception("Direct export (%s) failed for message %s", file_type, message_id)
        msg.export_status = 'failed'
        msg.export_error = str(e)[:2000]
        msg.save(update_fields=['export_status', 'export_error'])
        return Response({'error': 'Failed to generate file', 'export_status': 'failed'}, status=500)

    return Response({
        'message_id': msg.id,
        'export_status': msg.export_status,
        'export_file_url': msg.export_file_url,
        'export_file_type': msg.export_file_type,
    })


# ===========================================================================
#  Document Upload
# ===========================================================================

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes(_DOCUMENT_THROTTLE_CLASSES)
def upload_document(request):
    """Upload a document for Q&A. Text extraction (can be slow — OCR, PyMuPDF)
    runs async on the "documents" Celery queue; poll GET /documents/<id>/ or
    /documents/ for extraction_status."""
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file provided'}, status=400)

    from .document_processor import validate_upload

    file_type, error = validate_upload(file)
    if error:
        return Response({'error': error}, status=400)

    conversation_id = request.data.get('conversation_id')
    conversation = None
    if conversation_id:
        try:
            conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
        except Conversation.DoesNotExist:
            pass

    doc = Document.objects.create(
        user=request.user,
        conversation=conversation,
        file=file,
        original_filename=file.name,
        file_type=file_type,
        file_size=file.size,
        extraction_status='pending',
    )
    extract_text_task.delay(doc.id)

    return Response(DocumentSerializer(doc).data, status=201)
# ScopedRateThrottle needs `throttle_scope` on the view class — api_view's
# attribute-copy list doesn't include it, so set it directly on the
# WrappedAPIView the decorator produced (DRF's `APIView.as_view()` stashes
# the class on the returned callable as `.cls`).
upload_document.cls.throttle_scope = 'document_conversion'


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_documents(request):
    """List user's uploaded documents. Bounded with manual offset/limit
    (same pattern as get_sign_in_logs/get_audit_logs) — plain array response,
    unlike those two, since the frontend's getDocuments() expects a bare list."""
    try:
        limit = min(int(request.query_params.get('limit', 100)), 200)
    except (ValueError, TypeError):
        limit = 100
    try:
        offset = int(request.query_params.get('offset', 0))
    except (ValueError, TypeError):
        offset = 0

    docs = Document.objects.filter(user=request.user)[offset:offset + limit]
    return Response(DocumentSerializer(docs, many=True).data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def document_status(request, doc_id):
    """Poll target for async text extraction kicked off by upload_document."""
    try:
        doc = Document.objects.get(id=doc_id, user=request.user)
    except Document.DoesNotExist:
        return Response({'error': 'Document not found'}, status=404)
    return Response(DocumentSerializer(doc).data)


# ===========================================================================
#  Logs & Stats
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_sign_in_logs(request):
    """Sign-in logs with pagination and filters (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import SignInLog

    logs = SignInLog.objects.select_related('user').order_by('-timestamp')

    # Filters
    status_filter = request.query_params.get('status')
    auth_method = request.query_params.get('auth_method')
    username = request.query_params.get('username')

    if status_filter:
        logs = logs.filter(status=status_filter)
    if auth_method:
        logs = logs.filter(authentication_method=auth_method)
    if username:
        logs = logs.filter(username__icontains=username)

    # Pagination
    try:
        limit = min(int(request.query_params.get('limit', 50)), 200)
    except (ValueError, TypeError):
        limit = 50
    try:
        offset = int(request.query_params.get('offset', 0))
    except (ValueError, TypeError):
        offset = 0
    total = logs.count()

    results = []
    for log in logs[offset:offset + limit]:
        results.append({
            'id': log.id,
            'user_display': log.user.username if log.user else log.username,
            'username': log.username,
            'status': log.status,
            'status_display': log.get_status_display() if hasattr(log, 'get_status_display') else log.status,
            'ip_address': log.ip_address,
            'location': log.location or '',
            'user_agent': log.user_agent or '',
            'authentication_method': log.authentication_method,
            'auth_method_display': log.authentication_method,
            'timestamp': log.timestamp.isoformat(),
            'failure_reason': log.failure_reason or '',
        })

    return Response({'count': total, 'results': results})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_audit_logs(request):
    """Audit logs with pagination and filters (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import AuditLog

    logs = AuditLog.objects.all().order_by('-timestamp')

    action_filter = request.query_params.get('action')
    performed_by = request.query_params.get('performed_by')

    if action_filter:
        logs = logs.filter(action__icontains=action_filter)
    if performed_by:
        logs = logs.filter(performed_by__username__icontains=performed_by)

    try:
        limit = min(int(request.query_params.get('limit', 50)), 200)
    except (ValueError, TypeError):
        limit = 50
    try:
        offset = int(request.query_params.get('offset', 0))
    except (ValueError, TypeError):
        offset = 0
    total = logs.count()

    results = []
    for log in logs[offset:offset + limit]:
        results.append({
            'id': log.id,
            'performed_by_display': log.performed_by.username if log.performed_by else 'System',
            'action': log.action,
            'action_display': log.get_action_display() if hasattr(log, 'get_action_display') else log.action,
            'action_target': log.action_target,
            'action_target_type': log.action_target_type,
            'action_target_type_display': log.action_target_type,
            'description': log.description,
            'timestamp': log.timestamp.isoformat(),
        })

    return Response({'count': total, 'results': results})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_log_stats(request):
    """Combined log statistics (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    from accounts.models import SignInLog, AuditLog

    total = SignInLog.objects.count()
    successful = SignInLog.objects.filter(status='success').count()
    failed = SignInLog.objects.filter(status='failed').count()

    auth_methods = {}
    for method_row in SignInLog.objects.values('authentication_method').annotate(cnt=Count('id')):
        auth_methods[method_row['authentication_method']] = method_row['cnt']

    recent_sign_ins = []
    for log in SignInLog.objects.order_by('-timestamp')[:10]:
        recent_sign_ins.append({
            'id': log.id,
            'username': log.username,
            'status': log.status,
            'status_display': log.status,
            'timestamp': log.timestamp.isoformat(),
        })

    recent_audits = []
    for log in AuditLog.objects.order_by('-timestamp')[:10]:
        recent_audits.append({
            'id': log.id,
            'performed_by_display': log.performed_by.username if log.performed_by else 'System',
            'action_display': log.action,
            'action_target': log.action_target,
            'action_target_type_display': log.action_target_type,
            'timestamp': log.timestamp.isoformat(),
        })

    return Response({
        'sign_in_stats': {
            'total': total,
            'successful': successful,
            'failed': failed,
            'auth_methods': auth_methods,
        },
        'recent_sign_ins': recent_sign_ins,
        'recent_audits': recent_audits,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_llm_usage_logs(request):
    """Detailed LLM usage logs (admin only)."""
    if not request.user.is_admin():
        return Response({'error': 'Access denied'}, status=403)

    logs = LLMUsageLog.objects.select_related('user').order_by('-created_at')

    provider_filter = request.query_params.get('provider')
    username_filter = request.query_params.get('username')
    model_filter = request.query_params.get('model')

    if provider_filter:
        logs = logs.filter(provider=provider_filter)
    if username_filter:
        logs = logs.filter(user__username__icontains=username_filter)
    if model_filter:
        logs = logs.filter(model__icontains=model_filter)

    limit = min(int(request.query_params.get('limit', 25)), 200)
    offset = int(request.query_params.get('offset', 0))
    total = logs.count()

    results = []
    for log in logs[offset:offset + limit]:
        results.append({
            'id': log.id,
            'user': log.user.username if log.user else None,
            'provider': log.provider,
            'model': log.model,
            'prompt_tokens': log.prompt_tokens,
            'cached_tokens': log.cached_tokens,
            'completion_tokens': log.completion_tokens,
            'total_tokens': log.total_tokens,
            'cost_usd': str(log.cost_usd),
            'latency_ms': log.latency_ms,
            'created_at': log.created_at.isoformat(),
        })

    return Response({'count': total, 'results': results})


# ===========================================================================
#  Dashboard stats (backward compat)
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def dashboard_stats(request):
    """Simple stats for the dashboard."""
    user = request.user
    total_conversations = Conversation.objects.filter(user=user, is_active=True).count()
    total_messages = Message.objects.filter(conversation__user=user).count()
    providers_used = (
        Conversation.objects.filter(user=user, is_active=True)
        .values('llm_provider__name')
        .distinct()
        .count()
    )

    return Response({
        'total_conversations': total_conversations,
        'total_messages': total_messages,
        'providers_used': providers_used,
    })


# ===========================================================================
#  My Permissions (user-facing)
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def my_permissions(request):
    """Return the current user's LLM permissions and quota info."""
    # Superusers get automatic access to all active models
    if request.user.is_superuser:
        active_providers = LLMProvider.objects.filter(is_active=True)
        # Create virtual unlimited permissions for superusers
        virtual_perms = []
        for provider in active_providers:
            virtual_perms.append({
                'llm_provider': {
                    'id': provider.id,
                    'name': provider.name,
                    'display_name': provider.display_name,
                    'description': provider.description,
                    'icon_name': provider.icon_name,
                    'provider_type': provider.provider_type,
                    'model_name': provider.model_name,
                    'is_active': provider.is_active,
                    'is_default': provider.is_default,
                    'supports_code': provider.supports_code,
                    'supports_document_upload': provider.supports_document_upload,
                    'supports_streaming': provider.supports_streaming,
                },
                'quota_minutes': None,  # Unlimited
                'used_seconds': 0,
                'is_active': True,
            })
        return Response(virtual_perms)
    
    # Regular users get their assigned permissions
    perms = UserLLMPermission.objects.filter(
        user=request.user, is_active=True
    ).select_related('llm_provider')
    return Response(UserLLMPermissionSerializer(perms, many=True).data)


# ===========================================================================
#  Document Converter
# ===========================================================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def converter_check_access(request):
    """Check if user has access to document converter."""
    has_access = request.user.is_superuser or getattr(request.user, 'has_document_converter', False)
    return Response({'has_access': has_access})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def converter_formats(request):
    """Return supported input/output formats and quality presets."""
    return Response({
        'input_formats': {key: value for key, value in INPUT_FORMATS.items()
                          if key in settings.CONVERTER_ALLOWED_UPLOAD_TYPES and get_available_outputs(key)},
        'output_formats': OUTPUT_FORMATS,
        'quality_presets': QUALITY_PRESETS,
        'max_upload_size_mb': settings.MAX_UPLOAD_SIZE_MB,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def converter_get_outputs(request):
    """Get available output formats for a given input file."""
    file = request.FILES.get('file')
    if not file:
        input_format = request.data.get('input_format', '')
    else:
        input_format = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
    
    if not input_format:
        return Response({'error': 'No file or input_format provided'}, status=400)
    
    category = get_file_category(input_format)
    available_outputs = get_available_outputs(input_format)
    if input_format not in settings.CONVERTER_ALLOWED_UPLOAD_TYPES:
        available_outputs = {}
    
    return Response({
        'input_format': input_format,
        'category': category,
        'available_outputs': available_outputs,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
@throttle_classes(_DOCUMENT_THROTTLE_CLASSES)
def converter_convert(request):
    """Kick off a document conversion. The actual conversion (can take seconds
    to minutes — OCR, PyMuPDF, LibreOffice) runs async on the "documents"
    Celery queue; poll GET /converter/<job_id>/status/ or /converter/history/
    for job.status."""
    user = request.user

    # Check access
    if not user.is_superuser and not getattr(user, 'has_document_converter', False):
        return Response({'error': 'Access denied. Document converter not enabled for your account.'}, status=403)

    # Validate request
    file = request.FILES.get('file')
    target_format = request.data.get('target_format', '').lower().lstrip('.')
    quality = request.data.get('quality', 'high')

    if not file:
        return Response({'error': 'No file provided'}, status=400)
    if not target_format:
        return Response({'error': 'No target_format provided'}, status=400)
    from .document_processor import validate_upload
    _, upload_error = validate_upload(file, allowed_types=settings.CONVERTER_ALLOWED_UPLOAD_TYPES)
    if upload_error:
        return Response({'error': upload_error}, status=400)
    if quality not in QUALITY_PRESETS:
        quality = 'high'

    # Extract input format
    original_filename = file.name
    input_format = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''

    if input_format not in INPUT_FORMATS:
        return Response({'error': f'Unsupported input format: {input_format}'}, status=400)

    # Validate target format is available for this input
    available = get_available_outputs(input_format)
    if target_format not in available:
        return Response({
            'error': f'Cannot convert {input_format} to {target_format}',
            'available_formats': list(available.keys()),
        }, status=400)

    # Create conversion job — the Celery task moves it to 'processing' once a
    # worker picks it up, then 'completed'/'failed'.
    job = ConversionJob.objects.create(
        user=user,
        original_filename=original_filename,
        original_format=input_format,
        target_format=target_format,
        quality=quality,
        input_file=file,
        file_size=file.size,
        status='pending',
    )
    convert_document_task.delay(job.id)

    return Response({
        'success': True,
        'job': ConversionJobSerializer(job, context={'request': request}).data,
    }, status=202)
converter_convert.cls.throttle_scope = 'document_conversion'


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def converter_status(request, job_id):
    """Poll target for the async conversion kicked off by converter_convert."""
    user = request.user
    try:
        job = ConversionJob.objects.get(id=job_id, user=user)
    except ConversionJob.DoesNotExist:
        return Response({'error': 'Conversion not found'}, status=404)
    return Response(ConversionJobSerializer(job, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def converter_history(request):
    """Get user's conversion history."""
    user = request.user
    
    # Check access
    if not user.is_superuser and not getattr(user, 'has_document_converter', False):
        return Response({'error': 'Access denied'}, status=403)
    
    jobs = ConversionJob.objects.filter(user=user).order_by('-created_at')[:50]
    return Response({
        'conversions': ConversionJobSerializer(jobs, many=True, context={'request': request}).data
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def converter_download(request, job_id):
    """Stream the converted file directly — works regardless of DEBUG/nginx config."""
    import mimetypes
    from django.http import FileResponse, Http404

    close_old_connections()

    user = request.user
    try:
        job = ConversionJob.objects.get(id=job_id, user=user)
    except ConversionJob.DoesNotExist:
        raise Http404

    if job.status != 'completed' or not job.output_file:
        raise Http404

    file_path = job.output_file.path
    if not os.path.exists(file_path):
        raise Http404

    mime_type, _ = mimetypes.guess_type(file_path)
    response = FileResponse(
        open(file_path, 'rb'),
        content_type=mime_type or 'application/octet-stream',
        as_attachment=True,
        filename=os.path.basename(file_path),
    )
    return response


@api_view(['DELETE'])
@permission_classes([permissions.IsAuthenticated])
def converter_delete(request, job_id):
    """Delete a conversion job and its files."""
    user = request.user
    
    with transaction.atomic():
        job = ConversionJob.objects.select_for_update().filter(id=job_id, user=user).first()
        if not job:
            return Response({'error': 'Conversion not found'}, status=404)
        if job.status in ('pending', 'processing'):
            return Response({'error': 'Wait for the job to finish before deleting it.'}, status=409)
        files = [job.input_file, job.output_file] + [item.file for item in job.additional_inputs.all()]
        job.delete()
        for file in files:
            if file:
                transaction.on_commit(lambda file=file: file.delete(save=False))
    return Response({'success': True})

