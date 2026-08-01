FROM python:3.11-slim

# System-level build dependencies (needed for psycopg2, cryptography, PyMuPDF)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (separate layer — cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Collect static files at build time so the image is self-contained
RUN python manage.py collectstatic --noinput --settings=multimodel.settings || true

# Create a non-root user; Django should never run as root in production
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Create directories that Django writes to at runtime
RUN mkdir -p /app/logs /app/media

# Health check — hits the existing /api/health/ endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health/')"

# Expose port used by gunicorn
EXPOSE 8000

# Run migrations then start gunicorn (WSGI). Every view in this codebase is a
# synchronous DRF APIView — including the SSE stream endpoint, which is a
# regular StreamingHttpResponse, not an async view — so there is no async
# code here for an ASGI server/event loop to actually benefit from. gunicorn
# with the gthread worker class gives --workers x --threads real concurrent
# request slots (e.g. 10x10 = 100), instead of uvicorn's effective
# concurrency of just --workers (4) since nothing yields to its event loop.
CMD ["sh", "-c", "python manage.py migrate && gunicorn multimodel.wsgi:application --workers 10 --threads 10 --worker-class gthread --timeout 150 --bind 0.0.0.0:8000"]
