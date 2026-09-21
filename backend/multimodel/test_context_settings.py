"""Isolated SQLite settings for context regression tests; no external services."""
import os

os.environ['DEBUG'] = 'False'
os.environ['SECRET_KEY'] = 'context-regression-tests-only'

from .settings import *  # noqa: F403,E402

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
# Production migrations include PostgreSQL-only trigram indexes. Test the current
# models with SQLite; validate production migrations separately on PostgreSQL.
MIGRATION_MODULES = {'accounts': None, 'admin_portal': None}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
