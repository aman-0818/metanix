# Import Celery app so it initializes when Django starts.
# This ensures @shared_task decorators work correctly and
# Celery workers pick up tasks from all installed apps.
from .celery import app as celery_app

__all__ = ('celery_app',)
