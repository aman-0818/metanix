# Metanix frontend redesign

The frontend uses the supplied `public/matenix-logo.png`, Inter typography, warm neutral surfaces, a restrained teal accent, and a matching charcoal dark theme. Shared tokens live in `src/index.css`; `Brand` and `ThemeToggle` provide consistent identity and appearance controls.

## Implemented

- Split authentication layout, visible field labels, password visibility, validation and loading feedback. Microsoft sign-in remains conditional on `VITE_AZURE_AD_ENABLED=true`.
- Workspace sidebar with projects, searchable history, rename/delete controls, documents, converter access, permission-gated administration, collapse and a mobile drawer.
- Redesigned welcome screen, composer, model picker, message presentation, code blocks, artifact drawer, attachment states and presentation settings.
- Document library uses the existing documents API and supports attaching processed documents to a conversation.
- Converter shows upload, format selection, queued/processing state, completion, download and history. It now polls the existing conversion status endpoint after an asynchronous 202 response.
- Admin presentation covers users, permissions, quotas, feature flags, providers, usage/costs, security/audit and logs without replacing the underlying data or operations.
- Browser metadata, favicon, loading screen, authentication callback and not-found page are branded consistently.
- Removed unused animated effects, their Three.js dependencies, obsolete app styles and unused mock data.

Backend endpoints, payloads, authentication stores and token-refresh contracts were retained. The Vite development proxy routes `/api` and `/media` to the existing backend; it also allows the frontend to run on a separate loopback port without changing backend CORS settings. The existing sidebar storage key is intentionally retained for preference compatibility.

## Verification

- Production build: passed.
- TypeScript (`tsc --noEmit -p tsconfig.app.json`): passed.
- Real local authentication and logout: passed. Azure login button absent when disabled.
- Real database-driven model list, conversation list, documents list and all five admin sections: rendered successfully.
- Chat, admin and converter: no page overflow at 1440px desktop and 390px mobile; login additionally checked at 320, 768 and 1024px.
- Browser runtime: no page JavaScript errors in tested flows.
- Axe WCAG A/AA scans: no violations on the final chat, admin and converter views, or dark-mode chat.
- Password visibility, presentation theme/slide controls, mobile drawer Escape handling and callback/not-found routes: passed.
- Isolated browser API fixtures: SSE token assembly, draft preservation during generation, presentation request mode and download, asynchronous conversion polling and download all passed. These fixtures were confined to browser testing; no mocked responses or providers were added to application code.
- Repository-wide ESLint remains nonzero: 57 existing `no-explicit-any` violations, two empty-interface violations and a Tailwind `require()` violation, plus hook/style warnings. This does not prevent compilation or the production build.

## Local service limitations

The configured Ollama model returned a response failure through the real SSE endpoint. The UI displayed the error and retry control correctly. A successful model-generated response and real PPTX generation could not be confirmed.

The real document upload returned HTTP 201 and conversion returned HTTP 202. Both remained queued. The running Docker services included frontend, backend, PostgreSQL and Redis, but no worker container. Actual extraction, conversion completion and generated-file downloads therefore remain unverified against the local worker; their frontend transitions were checked with isolated browser fixtures.

The admin security view reported that API-key encryption is not configured. The redesign displays this existing backend state without changing configuration.

## Temporary QA records

These records were created by this QA run and are retained at the user’s explicit request. Automatic approval review initially blocked permanent deletion because explicit cleanup authorization was required:

- Document ID 1: `metanix-ui-qa.txt`.
- Conversion ID 1: `metanix-ui-qa.txt` to PDF.
- Conversation ID 2: prompt `Reply with exactly: Metanix is ready.`.

No existing user records were deleted or reconfigured.

## Preview

The review server is available at `http://127.0.0.1:5175`. The existing Docker frontend already occupies port 5173. To start this review server again:

```powershell
cd Frontend
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```
