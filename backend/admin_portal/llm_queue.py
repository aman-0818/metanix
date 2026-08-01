import logging
import queue
import threading
from django.conf import settings

logger = logging.getLogger(__name__)


class QueueTask:
    def __init__(self, func, args, kwargs):
        self.func = func
        self.args = args
        self.kwargs = kwargs
        self.event = threading.Event()
        self.result = None
        self.error = None

    def run(self):
        try:
            self.result = self.func(*self.args, **self.kwargs)
        except Exception as exc:
            self.error = exc
        finally:
            self.event.set()


class LLMRequestQueue:
    def __init__(self):
        # Respect an operator's configured concurrency as-is — this used to be
        # silently floored to 5, which overrode a deliberately low setting
        # (e.g. QUEUE_CONCURRENCY=1 for a single-GPU local Ollama box) and
        # let that many requests pile onto hardware that could only serve one
        # at a time.
        configured = getattr(settings, 'QUEUE_CONCURRENCY', 5)
        self.concurrency = int(configured or 0)
        if 0 < self.concurrency < 5:
            logger.warning(
                "QUEUE_CONCURRENCY=%d is unusually low — LLM requests will "
                "serialize heavily under concurrent load. This is respected "
                "as configured (e.g. for single-GPU/local model deployments).",
                self.concurrency,
            )
        # Respect configured max size; default to 100 if not set
        configured_max = getattr(settings, 'QUEUE_MAX_SIZE', None)
        if configured_max is None:
            self.max_size = 100
        else:
            # allow 0 (unlimited) or any positive int
            self.max_size = int(configured_max)
        self.queue = queue.Queue(maxsize=self.max_size or 0)
        self._started = False
        self._lock = threading.Lock()

        # Shared concurrency gate for the SSE streaming path (ChatStreamView),
        # which can't go through submit() below since it needs to yield chunks
        # incrementally rather than block for a single final result. Streaming
        # requests draw from the same concurrency budget as queued
        # (non-streaming) requests, since both ultimately hit the same
        # downstream LLM provider/hardware.
        self.stream_semaphore = (
            threading.BoundedSemaphore(self.concurrency) if self.concurrency > 0 else None
        )
        self.stream_timeout = int(getattr(settings, 'STREAM_TIMEOUT_SECONDS', 300))

    def acquire_stream_slot(self, timeout=150):
        """Block up to `timeout`s for a free concurrency slot for a streaming
        LLM call. Returns False if none became available in time."""
        if self.stream_semaphore is None:
            return True
        return self.stream_semaphore.acquire(timeout=timeout)

    def release_stream_slot(self):
        if self.stream_semaphore is not None:
            self.stream_semaphore.release()

    def _start_workers(self):
        with self._lock:
            if self._started or self.concurrency <= 0:
                return
            for _ in range(self.concurrency):
                worker = threading.Thread(target=self._worker, daemon=True)
                worker.start()
            self._started = True

    def _worker(self):
        while True:
            task = self.queue.get()
            task.run()
            self.queue.task_done()

    def submit(self, func, *args, **kwargs):
        if self.concurrency <= 0:
            return func(*args, **kwargs)

        self._start_workers()
        task = QueueTask(func, args, kwargs)
        if self.max_size and self.queue.full():
            raise RuntimeError('LLM request queue is full')
        self.queue.put(task)
        # Wait for task with timeout (150s for large models like llama3)
        if not task.event.wait(timeout=150):
            raise RuntimeError('LLM request timed out after 150 seconds')
        if task.error:
            raise task.error
        return task.result


llm_request_queue = LLMRequestQueue()
