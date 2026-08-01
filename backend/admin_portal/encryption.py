"""
API Key Encryption Utilities
============================
Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) to store
API keys encrypted at rest in the database.

Master key is read from ENCRYPTION_KEY in .env.
Generate a new key once:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Master key management
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_fernet() -> Fernet | None:
    """Return a cached Fernet instance using the master key from settings/env."""
    from decouple import config
    key = config('ENCRYPTION_KEY', default='')
    if not key:
        logger.warning('ENCRYPTION_KEY not set in .env — encrypted API keys unavailable')
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        logger.error('Invalid ENCRYPTION_KEY: %s', exc)
        return None


def is_encryption_available() -> bool:
    """Check whether the encryption system is ready."""
    return _get_fernet() is not None


# ---------------------------------------------------------------------------
#  Encrypt / Decrypt
# ---------------------------------------------------------------------------

def encrypt_api_key(plaintext: str) -> str:
    """
    Encrypt a plaintext API key → base64 Fernet token (safe for TextField).
    Returns empty string if encryption is unavailable.
    """
    if not plaintext:
        return ''
    fernet = _get_fernet()
    if fernet is None:
        raise RuntimeError('Encryption not available — set ENCRYPTION_KEY in .env')
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """
    Decrypt a Fernet token back to the original API key.
    Returns empty string on failure (corrupt data, wrong key, etc.).
    """
    if not ciphertext:
        return ''
    fernet = _get_fernet()
    if fernet is None:
        logger.warning('Cannot decrypt — ENCRYPTION_KEY not configured')
        return ''
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        logger.error('Failed to decrypt API key — token invalid or key changed')
        return ''
    except Exception as exc:
        logger.error('Unexpected decryption error: %s', exc)
        return ''


def generate_encryption_key() -> str:
    """Generate a new Fernet key (for initial setup)."""
    return Fernet.generate_key().decode()


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def mask_api_key(key: str) -> str:
    """Return a masked version: first 4 and last 4 chars visible."""
    if not key or len(key) <= 10:
        return '••••••••' if key else ''
    return f"{key[:4]}{'•' * (len(key) - 8)}{key[-4:]}"
