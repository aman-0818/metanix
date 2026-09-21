"""Content-free stage timings; monotonic clocks work across wall-clock changes."""
import logging
import time
from functools import wraps

logger = logging.getLogger(__name__)


def timed(stage):
    def decorate(fn):
        @wraps(fn)
        def measured(*args, **kwargs):
            started = time.perf_counter()
            outcome = 'ok'
            try:
                return fn(*args, **kwargs)
            except Exception:
                outcome = 'error'
                raise
            finally:
                logger.info('chat_stage stage=%s duration_ms=%.2f outcome=%s',
                            stage, (time.perf_counter() - started) * 1000, outcome)
        return measured
    return decorate
