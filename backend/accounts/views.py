import secrets
import logging
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.conf import settings
from admin_portal.services.usage_stats import get_user_usage_summary
from django.http import HttpResponseRedirect
from .models import User
from .serializers import (
    UserSerializer, UserListSerializer, LoginSerializer
)
from .azure_ad import build_authorize_url, exchange_code_for_tokens, verify_id_token, build_logout_url
from .logging_utils import log_sign_in, log_audit_event

logger = logging.getLogger(__name__)


def _build_session_payload(user: User):
    return {
        'quota_minutes': user.session_quota_minutes,
        'used_seconds': user.get_session_used_seconds(),
        'remaining_seconds': user.get_session_remaining_seconds(),
        'session_started_at': user.session_started_at,
        'is_active': user.session_started_at is not None,
    }


def _build_user_payload(user: User):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'role': user.role,
        'is_admin': user.is_admin(),
        'is_superuser': user.is_superuser,
        'is_staff': user.is_staff,
        'has_document_converter': user.has_document_converter,
        'cost_quota_usd': str(user.cost_quota_usd) if user.cost_quota_usd is not None else None,
        'cost_used_usd': str(user.cost_used_usd) if user.cost_used_usd else '0',
    }


class LoginView(APIView):
    """View for user login"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # No authentication for login

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        username = request.data.get('username', '')
        
        if serializer.is_valid():
            user = serializer.validated_data['user']
            if user.is_session_quota_exceeded():
                user.stop_session()
                log_sign_in(
                    username=username,
                    user=user,
                    status='failed',
                    failure_reason='Session quota exceeded',
                    authentication_method='local',
                    request=request
                )
                return Response(
                    {'error': 'Your session quota limit has expired. Please contact the administrator to request more quota.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            user.start_session()
            log_sign_in(
                username=username,
                user=user,
                status='success',
                authentication_method='local',
                request=request
            )
            # Log user login for all users
            log_audit_event(
                action='user_login',
                performed_by=user,
                action_target=user.username,
                action_target_type='user' if not user.is_admin() else 'admin',
                description=f"User {user.username} logged in via local authentication",
                request=request
            )
            if user.is_admin():
                log_audit_event(
                    action='admin_login',
                    performed_by=user,
                    action_target=user.username,
                    action_target_type='admin',
                    description=f"Admin {user.username} logged in",
                    request=request
                )
            refresh = RefreshToken.for_user(user)
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': _build_user_payload(user),
                'session': _build_session_payload(user),
            })
        
        # Log failed login attempt — the specific reason (stashed by
        # LoginSerializer._fail) goes server-side; the client only ever
        # gets the generic serializer.errors message, to avoid user
        # enumeration via distinguishable error responses.
        log_sign_in(
            username=username,
            status='failed',
            failure_reason=getattr(serializer, 'failure_reason', None) or str(serializer.errors),
            authentication_method='local',
            request=request
        )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AzureAuthorizeView(APIView):
    """Return Azure AD authorization URL"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        if not settings.AZURE_AD_ENABLED:
            return Response({'error': 'Azure AD login is not enabled'}, status=status.HTTP_400_BAD_REQUEST)

        state = request.query_params.get('state') or secrets.token_urlsafe(16)
        nonce = request.query_params.get('nonce') or secrets.token_urlsafe(16)
        code_challenge = request.query_params.get('code_challenge')
        code_challenge_method = request.query_params.get('code_challenge_method')
        if not code_challenge:
            # This app only ever has one client (the SPA), and it always
            # generates PKCE — an authorize request without a challenge means
            # something upstream is broken, not a caller we should humor.
            return Response({'error': 'PKCE code_challenge is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            authorize_url = build_authorize_url(state, nonce, code_challenge, code_challenge_method)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'authorize_url': authorize_url, 'state': state})


class AzureTokenView(APIView):
    """Exchange Azure AD auth code for platform JWT"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        if not settings.AZURE_AD_ENABLED:
            return Response({'error': 'Azure AD login is not enabled'}, status=status.HTTP_400_BAD_REQUEST)

        code = request.data.get('code')
        code_verifier = request.data.get('code_verifier')
        nonce = request.data.get('nonce')
        logger.info(f"Token exchange request - code_verifier present: {bool(code_verifier)}, verifier length: {len(code_verifier) if code_verifier else 0}")
        if not code:
            return Response({'error': 'Authorization code is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not code_verifier:
            # Mirrors the code_challenge requirement in AzureAuthorizeView —
            # a code exchange without the matching PKCE verifier should never
            # reach Azure; reject it here with a clear reason instead of
            # letting Azure's generic invalid_grant do the talking.
            return Response({'error': 'PKCE code_verifier is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            logger.info(f"Exchanging Azure AD code for tokens with code_verifier: {bool(code_verifier)}")
            token_response = exchange_code_for_tokens(code, code_verifier)
            id_token = token_response.get('id_token')
            if not id_token:
                logger.error("Azure AD id_token is missing from token response")
                return Response({'error': 'Azure AD id_token is missing'}, status=status.HTTP_400_BAD_REQUEST)
            logger.info("Verifying Azure AD ID token")
            claims = verify_id_token(id_token, nonce)
            logger.debug(f"Azure AD claims: oid={claims.get('oid')}, email={claims.get('email')}, upn={claims.get('upn')}, preferred_username={claims.get('preferred_username')}")
        except Exception as exc:
            logger.exception(f"Azure AD token exchange failed: {exc}")
            return Response({'error': f'Azure AD login failed: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

        ad_id = claims.get('oid') or claims.get('sub')
        email = claims.get('preferred_username') or claims.get('email') or claims.get('upn')
        username = claims.get('preferred_username') or claims.get('email') or claims.get('upn') or claims.get('unique_name') or claims.get('name')

        logger.debug(f"Azure AD claims - ad_id: {ad_id}, email: {email}, username: {username}, name: {claims.get('name')}")

        if not username:
            logger.error(f"No valid username found in Azure AD claims: {claims}")
            return Response({'error': 'Invalid Azure AD user information - no username. Claims available: ' + ', '.join(claims.keys())}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"Looking up user: ad_id={ad_id}, email={email}, username={username}")
        user = (
            User.objects.filter(ad_id=ad_id).first()
            or (email and User.objects.filter(email__iexact=email).first())
            or User.objects.filter(username__iexact=username).first()
        )

        if not user:
            logger.warning(f"User not found in database: ad_id={ad_id}, email={email}, username={username}")
            return Response({'error': 'User not provisioned in the platform'}, status=status.HTTP_403_FORBIDDEN)
        if not user.is_active:
            logger.warning(f"User account is disabled: {user.username}")
            return Response({'error': 'User account is disabled'}, status=status.HTTP_403_FORBIDDEN)
        if user.is_session_quota_exceeded():
            user.stop_session()
            return Response(
                {'error': 'Your session quota limit has expired. Please contact the administrator to request more quota.'},
                status=status.HTTP_403_FORBIDDEN
            )

        logger.info(f"User authenticated successfully: {user.username} (role: {user.role})")

        updated_fields = []
        if email and user.email != email:
            user.email = email
            updated_fields.append('email')
        if username and user.username != username:
            user.username = username
            updated_fields.append('username')
        if ad_id and user.ad_id != ad_id:
            user.ad_id = ad_id
            updated_fields.append('ad_id')

        first_name = claims.get('given_name')
        last_name = claims.get('family_name')
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            updated_fields.append('first_name')
        if last_name and user.last_name != last_name:
            user.last_name = last_name
            updated_fields.append('last_name')

        if updated_fields:
            user.save(update_fields=updated_fields)

        user.start_session()
        
        # Log Azure AD sign-in
        log_sign_in(
            username=user.username,
            user=user,
            status='success',
            authentication_method='azure_ad',
            request=request
        )
        # Log user login for all users
        log_audit_event(
            action='user_login',
            performed_by=user,
            action_target=user.username,
            action_target_type='user' if not user.is_admin() else 'admin',
            description=f"User {user.username} logged in via Azure AD",
            request=request
        )
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': _build_user_payload(user),
            'session': _build_session_payload(user),
        })


class AzureLogoutView(APIView):
    """Return Azure AD logout URL"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        if not settings.AZURE_AD_ENABLED:
            return Response({'error': 'Azure AD login is not enabled'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            logout_url = build_logout_url()
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'logout_url': logout_url})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def azure_server_callback(request):
    """
    Handle the Azure AD OAuth callback at the backend URL registered in Azure Portal.
    Forwards all query params (?code=...&state=...) to the frontend AuthCallback page.
    """
    frontend_url = getattr(settings, 'AZURE_AD_FRONTEND_REDIRECT_URI', 'http://localhost:5173/auth/callback')
    split_url = urlsplit(frontend_url)
    if not settings.DEBUG and split_url.hostname in ('localhost', '127.0.0.1'):
        # AZURE_AD_FRONTEND_REDIRECT_URI defaults to localhost:5173 for local
        # dev. If it's still unset in a real (non-DEBUG) deployment, silently
        # forwarding here would strand every real user's login on localhost
        # instead of gini.aionos.ai — fail loudly and visibly instead.
        logger.error("AZURE_AD_FRONTEND_REDIRECT_URI is unset or points at localhost in a non-DEBUG deployment")
        return Response(
            {'error': 'Azure AD frontend redirect URI is not configured for this environment'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    existing_query = parse_qsl(split_url.query, keep_blank_values=True)
    forwarded_params = list(request.GET.items())
    new_query = urlencode(existing_query + forwarded_params)
    redirect_target = urlunsplit((split_url.scheme, split_url.netloc, split_url.path, new_query, split_url.fragment))
    return HttpResponseRedirect(redirect_target)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def azure_callback_redirect(request):
    """Redirect backend callback to the frontend route if misconfigured."""
    if not settings.AZURE_AD_REDIRECT_URI:
        return Response({'error': 'Azure AD redirect URI is not configured'}, status=status.HTTP_400_BAD_REQUEST)

    redirect_url = settings.AZURE_AD_REDIRECT_URI
    split_url = urlsplit(redirect_url)
    if request.scheme == split_url.scheme and request.get_host() == split_url.netloc and request.path == split_url.path:
        return Response(
            {'error': 'Azure AD redirect URI points to backend /auth/callback. Set it to the frontend callback URL.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    query_items = parse_qsl(split_url.query, keep_blank_values=True)
    query_items.extend(list(request.GET.items()))
    new_query = urlencode(query_items)
    redirect_url = urlunsplit((split_url.scheme, split_url.netloc, split_url.path, new_query, split_url.fragment))
    return HttpResponseRedirect(redirect_url)


class UserListView(generics.ListAPIView):
    """View for listing all users (admin only)"""
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin():
            return User.objects.all().order_by('-date_joined')
        return User.objects.filter(id=user.id)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """View for user details (admin can see all, users see only themselves)"""
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin():
            return User.objects.all()
        return User.objects.filter(id=user.id)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_current_user(request):
    """Get current user information"""
    user = request.user
    return Response({
        **_build_user_payload(user),
        'session': _build_session_payload(user),
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_llm_usage_dashboard(request):
    try:
        days = int(request.query_params.get("days", 30))
    except (ValueError, TypeError):
        days = 30

    data = get_user_usage_summary(request.user, days=days)

    return Response({
        "user": request.user.username,
        "period_days": days,
        "totals": data["totals"],
        "by_provider": data["by_provider"],
        "by_model": data["by_model"],
    })
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def admin_llm_usage_dashboard(request):
    if not request.user.is_admin():
        return Response({"error": "Access denied"}, status=403)

    from django.db.models import Sum
    from admin_portal.models import LLMUsageLog

    totals = LLMUsageLog.objects.aggregate(
        total_tokens=Sum("total_tokens"),
        total_cost=Sum("cost_usd"),
    )

    by_user = (
        LLMUsageLog.objects.values("user__username")
        .annotate(
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("cost_usd"),
        )
        .order_by("-total_tokens")[:20]
    )

    by_provider = (
        LLMUsageLog.objects.values("provider")
        .annotate(
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("cost_usd"),
        )
    )

    return Response({
        "totals": totals,
        "by_user": list(by_user),
        "by_provider": list(by_provider),
    })



class SessionStatusView(APIView):
    """Get current session status for the authenticated user"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(_build_session_payload(user))


class LogoutView(APIView):
    """Stop session tracking and blacklist the refresh token for the authenticated user"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        user.stop_session()

        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                # Already invalid/expired/blacklisted — logout should still
                # succeed, there's nothing left to revoke.
                pass

        return Response({
            'message': 'Logged out',
            'session': _build_session_payload(user),
        })