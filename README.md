# AionosGini

Enterprise AI workspace: multi-LLM chat (including in-chat PPT generation),
document intelligence, and document conversion — with an admin portal for
user/role/quota management.

## Architecture

```
┌──────────────────────┐        ┌───────────────────────────────────────────┐
│  Frontend (Vite/React)│──────▶│  Backend (Django + DRF, ASGI/uvicorn)       │
│  :5173                │  REST │  :8000                                     │
│  Zustand + Router     │◀──SSE─│  JWT auth · LLM routing · Celery tasks      │
└──────────────────────┘        └───────────────┬─────────────────┬─────────┘
                                                 │                 │
                                     ┌───────────▼───────┐ ┌───────▼────────┐
                                     │ PostgreSQL (gini)  │ │ Redis           │
                                     │ users/chat/docs/…  │ │ cache · broker  │
                                     └────────────────────┘ └───────┬────────┘
                                                                     │
                                                          ┌──────────▼─────────┐
                                                          │ Celery worker       │
                                                          │ background jobs     │
                                                          └─────────────────────┘
```

### Backend (`backend/`, Django 4.2 + DRF)

- **`accounts`** — custom `User` model (role: admin/user, session quota, cost quota,
  feature flags), local username/password login, and Azure AD (OIDC/PKCE) SSO
  (`azure_ad.py`).
- **`admin_portal`** — everything else: DB-driven `LLMProvider` config (Azure OpenAI,
  OpenAI, Gemini, Claude, Ollama, etc. — added/edited from the Admin UI, no redeploy
  needed), chat + streaming (SSE) via `llm_engine.py` (including an in-chat "PPT" mode
  that generates a .pptx directly via `services/pptx_generator.py`), document
  upload/RAG via `document_processor.py`, document conversion (`services/`), usage/cost
  tracking, and audit/sign-in logs.
- **Celery** (`celery.py`) is general-purpose background-job infrastructure — separate
  worker process/container, survives backend restarts, scales independently of the web
  process. No tasks are currently registered; add an app's `tasks.py` to use it.
- **Redis** backs the cache (rate limits, sessions) and the Celery broker so state is
  shared across multiple uvicorn workers/containers.

### Frontend (`Frontend/`, Vite + React + TypeScript)

- `LoginPage` → local login or Azure AD SSO → `useAuthStore` (Zustand, persisted)
  holds the JWT and calls `apiService` (`src/lib/api.ts`) for everything.
- Pages: `Index` (chat), `Admin` (user/provider/log management), `DocumentConverter`,
  `AuthCallback` (Azure AD PKCE callback).
- Access token auto-refreshes on 401 via the refresh token; a failed refresh forces
  logout.

## Request flow (chat)

1. User logs in → `POST /api/accounts/login/` → JWT access/refresh pair.
2. Frontend sends `POST /api/admin/chat/` (or `/chat/stream/` for SSE) with the
   message + selected `LLMProvider`.
3. `llm_engine.py` builds the provider-specific request over a shared HTTP/2 client,
   retries transient errors (429/5xx) with backoff, and returns/streams the result.
4. Usage (tokens, cost) is logged to `LLMUsageLog`; conversation history persists to
   `Conversation`/`Message` (with periodic `ConversationSummary` for long threads).

## Authentication in this dev checkout

**SSO (Azure AD) is disabled for local dev** so you can iterate without an Azure
tenant:

- Backend: `AZURE_AD_ENABLED=False`, `ALLOW_LOCAL_AUTH=True` in `backend/.env`.
- Frontend: `VITE_AZURE_AD_ENABLED=false` in `Frontend/.env` hides the "Sign in with
  Azure AD" button.

To re-enable it, set both flags to `true` and fill in `AZURE_AD_TENANT_ID` /
`AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` / `AZURE_AD_REDIRECT_URI`.

## Prerequisites

- Docker + Docker Compose
- `backend/.env` and `Frontend/.env`, copied from their `.env.example` files
  (see [Environment files](#environment-files) below)

## Running locally (Docker)

```bash
docker compose up --build
```

| Service          | URL                              | Notes                              |
|------------------|-----------------------------------|-------------------------------------|
| Frontend         | http://localhost:5173             | Vite dev server                     |
| Backend API      | http://localhost:8000/api         | Django/DRF, health: `/api/health/`  |
| PostgreSQL       | localhost:5433                    | `gini_dev_db`                       |
| Redis            | localhost:6379                    | cache (db 1) + Celery broker (db 0) |

On first boot the backend container runs migrations and seeds two local dev users,
both with full admin/superuser access (from `backend/.env`):

| Username  | Password         | Role  |
|-----------|------------------|-------|
| `admin`   | see `ADMIN_PASSWORD` in `backend/.env` | admin |
| `devuser` | `DevUser123!`    | admin |

A default local Ollama `LLMProvider` (`llama3:1b`) is also seeded so the model picker
isn't empty out of the box — point `OLLAMA_BASE_URL` at a running Ollama server to use
it, or add other providers (OpenAI, Gemini, Claude, etc.) from the Admin Panel with an
API key.

## Environment files

- `backend/.env` — Django secrets, auth flags, optional LLM API keys. Not committed
  (`.gitignore`); regenerate `SECRET_KEY` before any shared or production deployment.
- `Frontend/.env` — `VITE_AZURE_AD_ENABLED` toggle.
- `.env` (repo root, optional) — overrides the Postgres credentials baked into
  `docker-compose.yml` (`DB_NAME`/`DB_USER`/`DB_PASSWORD`). Only needed to change
  the dev defaults or for a shared/production deployment.

All of the above are copied from a matching `.env.example`; none are committed, and
none should ever be — dev defaults are throwaway secrets, rotate everything before
deploying anywhere shared.

## License

Proprietary — © AIonOS. All rights reserved.
