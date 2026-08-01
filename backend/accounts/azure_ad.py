import json
import time
from functools import lru_cache
from urllib.parse import urlencode

import jwt
import requests
from django.conf import settings

# Only algorithm we ever accept for Azure AD id_tokens. Must NOT be derived
# from the token's own header (`alg`) — that lets an attacker pick the
# algorithm (e.g. downgrade to something exploitable) instead of us pinning
# it to what Azure AD actually signs with.
_ID_TOKEN_ALGORITHMS = ["RS256"]

# How long to trust a cached JWKS response before refetching. Microsoft
# rotates its signing keys occasionally; without a TTL, an @lru_cache-forever
# means every Azure AD login starts failing simultaneously the moment the
# key we cached is retired, until the process restarts.
_JWKS_TTL_SECONDS = 24 * 60 * 60
_jwks_cache: dict | None = None
_jwks_cached_at: float = 0.0


def _get_authority():
    tenant_id = settings.AZURE_AD_TENANT_ID
    if not tenant_id:
        raise ValueError("AZURE_AD_TENANT_ID is not configured")
    return f"https://login.microsoftonline.com/{tenant_id}"


def build_authorize_url(state: str, nonce: str, code_challenge: str | None = None, code_challenge_method: str | None = None) -> str:
    if not settings.AZURE_AD_CLIENT_ID or not settings.AZURE_AD_REDIRECT_URI:
        raise ValueError("Azure AD client ID or redirect URI is not configured")
    params = {
        "client_id": settings.AZURE_AD_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.AZURE_AD_REDIRECT_URI,
        "response_mode": "query",
        "scope": " ".join(settings.AZURE_AD_SCOPES),
        "state": state,
        # Bound to the ID token's `nonce` claim and re-checked in verify_id_token —
        # defense against a leaked/replayed ID token being reused outside the
        # authorization request that actually produced it.
        "nonce": nonce,
    }
    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = code_challenge_method or "S256"
    return f"{_get_authority()}/oauth2/v2.0/authorize?{urlencode(params)}"


def build_logout_url() -> str:
    post_logout = settings.AZURE_AD_LOGOUT_REDIRECT_URI or settings.AZURE_AD_REDIRECT_URI
    params = {}
    if post_logout:
        params["post_logout_redirect_uri"] = post_logout
    query = f"?{urlencode(params)}" if params else ""
    return f"{_get_authority()}/oauth2/v2.0/logout{query}"


def exchange_code_for_tokens(code: str, code_verifier: str | None = None) -> dict:
    if not settings.AZURE_AD_CLIENT_ID:
        raise ValueError("Azure AD client ID is not configured")
    data = {
        "client_id": settings.AZURE_AD_CLIENT_ID,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.AZURE_AD_REDIRECT_URI,
        "scope": " ".join(settings.AZURE_AD_SCOPES),
    }
    if settings.AZURE_AD_CLIENT_SECRET:
        data["client_secret"] = settings.AZURE_AD_CLIENT_SECRET
    if code_verifier:
        data["code_verifier"] = code_verifier
    token_url = f"{_get_authority()}/oauth2/v2.0/token"
    response = requests.post(token_url, data=data, timeout=15)
    if not response.ok:
        raise ValueError(f"Azure token exchange failed: {response.text}")
    return response.json()


@lru_cache(maxsize=1)
def _get_openid_config() -> dict:
    url = f"{_get_authority()}/v2.0/.well-known/openid-configuration"
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    return response.json()


def _fetch_jwks() -> dict:
    jwks_uri = _get_openid_config().get("jwks_uri")
    response = requests.get(jwks_uri, timeout=15)
    response.raise_for_status()
    return response.json()


def _get_jwks(force_refresh: bool = False) -> dict:
    """TTL-cached JWKS lookup (plain module-level cache, no new dependency).
    Refetches when the cache is stale, or immediately when `force_refresh` is
    set (used when a `kid` lookup misses, in case Microsoft just rotated
    keys)."""
    global _jwks_cache, _jwks_cached_at
    now = time.monotonic()
    if force_refresh or _jwks_cache is None or (now - _jwks_cached_at) > _JWKS_TTL_SECONDS:
        _jwks_cache = _fetch_jwks()
        _jwks_cached_at = now
    return _jwks_cache


def verify_id_token(id_token: str, nonce: str | None = None) -> dict:
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")

    jwks = _get_jwks().get("keys", [])
    key = next((k for k in jwks if k.get("kid") == kid), None)
    if not key:
        # Key might have just rotated on Microsoft's side — force a refetch
        # once before giving up.
        jwks = _get_jwks(force_refresh=True).get("keys", [])
        key = next((k for k in jwks if k.get("kid") == kid), None)
    if not key:
        raise ValueError("Unable to find a matching JWKS key")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
    issuer = _get_openid_config().get("issuer")
    claims = jwt.decode(
        id_token,
        public_key,
        algorithms=_ID_TOKEN_ALGORITHMS,
        audience=settings.AZURE_AD_CLIENT_ID,
        issuer=issuer,
    )
    # Replay/injection guard: the nonce we generated for this specific login
    # attempt must come back unchanged in the ID token, same trust chain as
    # `state` but bound to the token itself rather than the redirect.
    if nonce is not None and claims.get("nonce") != nonce:
        raise ValueError("Azure AD id_token nonce mismatch")
    return claims
