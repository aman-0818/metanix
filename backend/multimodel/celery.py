"""
Celery application configuration for Gini backend.

WHY THIS EXISTS:
  Previously, background tasks (presentation generation) ran in an in-process
  ThreadPoolExecutor (_presentation_executor in views.py). That approach had
  three problems:
    1. Thread pool was local to each process — multiple uvicorn workers or
       backend instances each had their own pool, so jobs couldn't be
       distributed or monitored centrally.
    2. Django request threads blocked on LLM calls (up to 150s), reducing
       the number of concurrent requests the server could handle.
    3. If the backend restarted mid-generation, the job was silently lost.

  Celery fixes all three:
    - Workers run as separate processes (separate container in docker-compose)
    - Jobs are stored in Redis broker — survive backend restarts
    - Horizontally scalable: add more celery-worker containers under load

USAGE:
  Start workers: celery -A multimodel worker -l info -c 8 -Q chat_post
                 celery -A multimodel worker -l info -c 4 -Q documents
                 (see docker-compose.yml: celery-worker-chat / celery-worker-documents)
  Monitor:       celery -A multimodel inspect ping
                 celery -A multimodel flower  (if flower is installed)
"""
import os

from celery import Celery

# Tell Celery which Django settings module to use
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'multimodel.settings')

app = Celery('multimodel')

# Read Celery config from Django settings using the CELERY_ namespace prefix
# e.g. CELERY_BROKER_URL in settings.py → broker_url in Celery
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover @shared_task decorated functions in each installed app's tasks.py
app.autodiscover_tasks()
