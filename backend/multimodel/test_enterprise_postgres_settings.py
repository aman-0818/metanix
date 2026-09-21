"""Isolated PostgreSQL integration tests; never point this at a production DB.

The test server is a disposable container bound only to localhost:55433.
Unlike SQLite tests this runs every production migration, including pgvector.
"""
from .test_context_settings import *  # noqa: F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql',
    'NAME': 'enterprise_tests', 'USER': 'postgres', 'PASSWORD': '',
    'HOST': '127.0.0.1', 'PORT': '55433', 'OPTIONS': {'connect_timeout': 5}}}
MIGRATION_MODULES = {}
