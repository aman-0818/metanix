# METANIX enterprise upgrade

## Scope and release status

This implementation adds company knowledge retrieval, optional live web search, configurable conversation context, and queued PDF utilities. One installation represents **one company**. Knowledge access uses the existing `admin` and `user` roles plus explicit user grants; administrators can manage and read all company documents.

Automated checks validate implementation behavior, including permissions in regular chat and SSE. They do **not** establish frontier-assistant quality, accurate live answers, production latency improvements, or parity with dedicated PDF products. Human comparison, real provider calls, complete production-ingress verification, and representative load tests remain release checks.

## Behavior and cost changes

| Area | Implemented behavior | Cost or operational effect |
| --- | --- | --- |
| Conversation history | Defaults increase from 12 messages / 6,000 estimated history tokens to **24 messages / 12,000 tokens**. Environment settings and provider overrides take precedence. | The default history input allowance doubles. Longer chats may send more input tokens and increase billing and latency; this is an explicit default change. |
| Provider context | `extra_config` accepts a model window, history message limit, token budget, and budget fraction. System/document text, output allowance, framing, and enabled web-tool headroom are reserved. | Larger overrides can increase input cost. The configured window is supplied by an administrator; it is not discovered automatically. |
| Topic continuity | Only explicit reset phrases discard the current history scope. Optional semantic retrieval recalls relevant earlier exchanges without treating language changes as resets. | Semantic retrieval adds embedding calls when enabled; no separate topic-classifier LLM call. |
| Memory | Relevant keyword-matching facts can be used proactively. Optional embeddings rank memory relevance. Company Knowledge mode excludes durable memory and prior answer context. | Semantic memory adds embedding calls when enabled. Existing background memory extraction remains a separate model workload. |
| Web search | The model chooses the native `web_search` function. Supported adapter types are OpenAI-compatible, Azure OpenAI, Anthropic, and Google. Both regular chat and SSE use the same bounded streaming tool loop. | At most two search attempts and three model rounds per reply. Even a failed external search consumes a reserved search quota slot. Search/embedding vendor charges are not included in the LLM cost ledger. |
| Latency | Content-free stage timings, bounded cached conversation-document text, scoped embedding cache, native first-call text streaming, and existing separate `chat_post` / `documents` queues. | Cache hits avoid repeated work. This does not establish a measured production latency reduction; synchronous DB work and WSGI request slots remain. |
| Converter | Batch format conversion, PDF merge/split/compress/rotate/reorder/watermark/page numbering/password operations/OCR, progress stages, and queued downloads. | CPU-heavy work runs in the `documents` worker. Existing global upload size and conversion throttle defaults are retained. |

Anthropic requests retain a separate system block with an ephemeral prompt-cache marker. Cache eligibility and savings depend on the selected model, prompt size, and provider response; no savings are assumed in this release assessment.

## Configuration

Set these values consistently on the web process and both worker services. In Compose, the services read `backend/.env`; do not commit credentials. Empty credential fields below are intentional.

```dotenv
CHAT_CONTEXT_MAX_MESSAGES=24
CHAT_CONTEXT_TOKEN_BUDGET=12000
CHAT_SEMANTIC_CONTEXT=False
CHAT_SEMANTIC_MEMORY=False

EMBEDDING_BACKEND=ollama
EMBEDDING_ENDPOINT=
EMBEDDING_MODEL=
EMBEDDING_API_KEY=
EMBEDDING_DIMENSIONS=384

WEB_SEARCH_ENABLED=False
TAVILY_API_KEY=
WEB_SEARCH_DAILY_LIMIT=30
WEB_SEARCH_INTERVAL_SECONDS=10
WEB_SEARCH_DOMAINS=

ENCRYPTION_KEY=
MAX_UPLOAD_SIZE_MB=25
ALLOWED_UPLOAD_TYPES=pdf,docx,txt,md,csv,xlsx
CONVERTER_ALLOWED_UPLOAD_TYPES=pdf,docx,txt,md,csv,xlsx,png,jpg,jpeg,gif,bmp,tiff,tif,webp
THROTTLE_DOCUMENT_CONVERSION=5/minute
```

To preserve the previous history allowance, explicitly set `CHAT_CONTEXT_MAX_MESSAGES=12` and `CHAT_CONTEXT_TOKEN_BUDGET=6000`. Per-provider values still override these globals.

### Provider settings

Use the admin provider-context panel to set the model window, history message limit, history budget, and web-search checkbox. Existing provider configuration keys are preserved. The provider API also accepts `context_fraction` (0.05-0.9; default 0.5), for example:

```json
{
  "context_window": 32768,
  "context_max_messages": 24,
  "context_token_budget": 12000,
  "context_fraction": 0.5,
  "web_search": false
}
```

This is a configuration example, not a claim about any particular model's capacity. Use that model's actual documented window. History estimates use UTF-8 byte counts, not a provider tokenizer. When a window is configured, requests whose mandatory context exceeds the available allowance fail with an actionable error.

### Embeddings and knowledge

- Set `EMBEDDING_ENDPOINT` to the **complete embedding request URL**, `EMBEDDING_MODEL` to a model available there, and `EMBEDDING_DIMENSIONS` to its actual output width. `ollama` uses the Ollama embedding response shape; `openai` uses the OpenAI-compatible embedding response shape. Configure approved destinations administratively.
- The embedding client batches up to 32 inputs, uses a 10-second timeout, rejects invalid/zero/non-finite vectors, and caches results for one hour with user or document/version scope.
- Company knowledge requires a working embedding service independently of the two optional semantic chat flags. Enable `CHAT_SEMANTIC_CONTEXT` and/or `CHAT_SEMANTIC_MEMORY` only after validating the chosen model, including languages used by employees. Embedding failures fall back to recent history or keyword memory; unavailable knowledge retrieval is reported explicitly.
- Changing embedding backend, endpoint, model, or dimensions changes the stored embedding identity. Previously indexed documents are excluded until replaced and reingested. The current admin flow uses file replacement for reindexing; it has no bulk model-migration command.

### Web search

Enable all three: `WEB_SEARCH_ENABLED=True`, a configured `TAVILY_API_KEY`, and `extra_config.web_search=true` on a supported provider. Company Knowledge mode does not use web search. A timeless request can finish after one model call with no search.

The daily quota is per user and server-side date, separately from chat quota. The 10-second interval applies to the first search in a new reply. One follow-up search after a successful search in the same reply is allowed immediately; both attempts still consume daily quota, and each reply remains capped at two attempts. `WEB_SEARCH_DOMAINS` is a comma-separated inclusion filter sent to Tavily; blank means no domain filter. The application calls a fixed HTTPS Tavily endpoint and does not fetch result URLs itself. Tavily supplies extracted result content; see its [Search API reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).

Responses include source links and a search date; SSE also emits search activity events. The new audit entry stores a SHA-256 query digest, result domains, and lookup time. It deliberately does not store raw search queries or page contents. Query text is still transmitted to the configured search provider. Source text is marked as untrusted evidence in the tool result.

## Company knowledge operations

The admin knowledge screen supports batches of 1-20 files, status polling, replacement, deletion, and access assignment. The underlying routes are `/api/admin/knowledge/` and `/api/admin/knowledge/<id>/`. A restricted document with no allowed roles or users is accessible only to administrators. Explicit user grants can provide access without granting the entire `user` role.

Ingestion runs on the `documents` queue: extract text, split into chunks of at most 1,800 UTF-8 bytes with 240-byte overlap, embed, and atomically store the current version. Documents over 2,000 chunks fail with guidance to divide the file. Replacement invalidates old chunks immediately; version checks prevent stale ingestion work from overwriting a replacement.

Retrieval filters to accessible, ready documents with the current embedding identity **before** distance ranking. It selects at most 12 candidates using cosine distance, adds a bounded keyword score, and injects at most six passages / 9,000 UTF-8 bytes of passage text plus source labels. Citations identify title, version, and passage. Missing evidence is explicitly reported to the model, which is instructed to avoid inventing company policy.

PostgreSQL uses `embedding <=> query_vector`. The shipped implementation uses exact search with no HNSW or IVFFlat index. Bounded prompt size does not imply constant database work as the corpus grows. The distinction between exact search and approximate indexes is described in the [pgvector documentation](https://github.com/pgvector/pgvector#querying).

Knowledge files use `knowledge_private/` storage and an authenticated, permission-checked download endpoint. Keep the private-media exclusion in the deployed proxy/application routing. A scanned document with no readable text fails with OCR guidance: run the Converter OCR operation, download the searchable PDF, and replace the knowledge file. OCR is not automatically invoked by ingestion.

## Converter operations and limits

Use the Converter UI or `/api/admin/converter/operations/`. Existing converter entitlement is required. The API validates extensions, file size and signatures before queueing, with additional checks for Office ZIP structure and expansion limits. Offered output pairs come from the explicit format matrix; not every advertised library format is an allowed upload.

- Merge accepts 2-20 PDFs in submitted order. Batch format conversion accepts 1-20 files and creates a job per file. Other PDF utilities accept one PDF.
- PDF utilities allow up to 300 total pages. Searchable-PDF OCR defaults to 50 pages, runs one OCR worker per process, and has a 200-second subprocess deadline. Office-to-PDF conversion uses a separate LibreOffice profile per job and a 120-second subprocess deadline.
- Split produces a ZIP containing individual selected pages. Compression uses PDF cleanup/deflation and does not guarantee that an already optimized file gets smaller. Page selection is one-based; ranges cannot repeat pages.
- Password operations require a valid shared `ENCRYPTION_KEY`. Password options are encrypted while queued and cleared from the job at completion/failure. Do not replace this key without planning for existing encrypted provider credentials and queued jobs.
- Outputs over 100 MB fail. UI progress reports stages and percentages from polling; it does not provide an accurate remaining-time estimate for every underlying executable.
- The backend image now installs LibreOffice Writer/Calc, OCRmyPDF, and Tesseract. Additional OCR language packages, fonts, unusual Office layouts, and complex scanned tables need corpus-specific validation.

The general/knowledge upload allowlist stays `pdf,docx,txt,md,csv,xlsx`. A separate `CONVERTER_ALLOWED_UPLOAD_TYPES` setting enables the listed raster-image formats for Converter uploads, including image-to-PDF conversion. Further allowlist changes require revisiting validation and document-parser exposure. The documents container has memory/CPU/PID limits, drops capabilities, and disables privilege escalation, but this is not comprehensive antivirus, content disarm, or a per-file hostile-document sandbox. Dependency selection reuses existing PyMuPDF for page operations and PDF-to-DOCX support, adds LibreOffice for Office rendering, and uses OCRmyPDF/Tesseract for searchable scans. The real executable fixtures validate text retention, not complex layout parity.

License references: [PyMuPDF](https://pymupdf.readthedocs.io/en/latest/faq/index.html) offers AGPL or commercial licensing; [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) uses MPL-2.0; [LibreOffice](https://www.libreoffice.org/licenses/) documents MPL-2.0/LGPL licensing and bundled notices. Preserve required notices and evaluate the distribution's dependency obligations, including OCR subprocess dependencies, before rollout. No commercial license was purchased or license-compliance determination made here.

## Deployment

1. Back up the PostgreSQL database and media volume. Retain the current application image and configuration for rollback. The new PostgreSQL Dockerfile keeps `postgres:17-alpine` and builds pgvector v0.8.6; it does not change the database major version or distribution family. Preserve the existing data volume.
2. Rebuild the PostgreSQL and backend/worker images. For a managed PostgreSQL service, arrange installation and creation of the `vector` extension in the application database first. Migration `0037_enterprise_knowledge` executes `CREATE EXTENSION IF NOT EXISTS vector`; its database role must have the required permission.
3. Configure environment settings above and the existing production database, Redis, authentication, encryption, and host settings. The repository Compose backend startup includes privileged **development account seeding**. Replace that command in a production override before starting a production stack; do not use the development seeding command there.
4. Start the updated database and Redis, run `python manage.py migrate` from the built backend environment, and verify `python manage.py showmigrations admin_portal`. This includes context migration `0036` and enterprise migrations `0037` / `0038` on installations that have not yet applied them. Verify `SELECT extversion FROM pg_extension WHERE extname = 'vector';` in the application database.
5. Start the web service and both workers with the same release and settings. Keep `chat_post` and `documents` queues separate and shared media mounted. The current documents worker has four Celery processes sharing a 2 GB / two CPU container limit; tune this only after concurrent OCR/Office load testing.
6. Build and deploy the frontend. Confirm the admin knowledge and provider-context panels and the employee Company Knowledge/Converter interfaces. Upload a small policy, wait for `ready`, ask an authorized employee a specific policy question, then check a denied user and replace the file to verify version behavior.
7. Verify SSE through the real public proxy using browser network timing or `curl -N` against an authenticated streaming request. The checked-in Nginx stream location disables buffering; also inspect any external ingress/CDN. The Nginx read timeout is 150 seconds, while the application stream cap defaults to 300 seconds; align deployment timeouts with the intended maximum request behavior.
8. Enable search and semantic features on a staging provider, run the checks below, then expand access. Turning search/semantic flags off and restoring 12/6,000 history settings gives a reversible behavior rollback. Schema rollback and restoration of old document versions require a separate database/media recovery plan; do not delete database volumes to roll back application code.

## Reproducible validation

### Recorded implementation checks

- The 71-test regression suite passed on SQLite and PostgreSQL: 70 passed and one real-OCR test skipped on Windows. PostgreSQL ran every production migration, including pgvector. The migration drift check reported no changes.
- All nine document-worker tests passed inside the built Linux image with networking disabled, including the Windows-skipped encrypted OCR test, DOCX -> LibreOffice PDF -> DOCX text retention, and scanned PDF -> searchable PDF OCR text retention.
- TypeScript checking and the Vite production build passed after the final UI edits.
- The repository SSE location passed an isolated Nginx test: three events sent 400 ms apart arrived at 13.7, 414.0, and 814.7 ms. This tests the actual location directives against a synthetic backend without TLS or production ingress.
- Provider/embedding/search integration tests use controlled responses. No real LLM, embedding, or Tavily calls, human quality review, or production load acceptance is claimed by those test results.

Run from the repository root in PowerShell with project dependencies installed:

```powershell
.\venv\Scripts\python.exe backend/manage.py test admin_portal.test_conversation_context admin_portal.test_conversation_titles admin_portal.test_enterprise admin_portal.test_web_protocol admin_portal.test_document_safety admin_portal.test_enterprise_flows --settings=multimodel.test_context_settings --verbosity 2
```

For PostgreSQL, create a **disposable local test container** with no production volume. The test settings deliberately use localhost port 55433 and a passwordless local test database. Do not expose this container beyond loopback or point these settings at production:

```powershell
docker build -t metanix-postgres-enterprise-check ./postgres
docker run -d --name metanix-pg-enterprise-check -p 127.0.0.1:55433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=enterprise_tests metanix-postgres-enterprise-check
docker exec metanix-pg-enterprise-check pg_isready -U postgres
```

After `pg_isready` reports readiness:

```powershell
.\venv\Scripts\python.exe backend/manage.py test admin_portal.test_conversation_context admin_portal.test_conversation_titles admin_portal.test_enterprise admin_portal.test_web_protocol admin_portal.test_document_safety admin_portal.test_enterprise_flows --settings=multimodel.test_enterprise_postgres_settings --verbosity 2
docker stop metanix-pg-enterprise-check
docker rm metanix-pg-enterprise-check
```

Real worker executable checks and frontend checks:

```powershell
docker build -t metanix-worker-enterprise-check ./backend
docker run --rm --network none metanix-worker-enterprise-check python manage.py test admin_portal.test_worker_tools admin_portal.test_document_safety --settings=multimodel.test_context_settings --verbosity 2
node Frontend/node_modules/typescript/bin/tsc --noEmit -p Frontend/tsconfig.app.json
npm --prefix Frontend run build -- --configLoader native
```

SQLite skips PostgreSQL-specific production migrations; it is a fast behavioral check, not a substitute for the PostgreSQL run. Worker tests skip when executables are missing outside the image, so a skipped local run is not an OCR/Office pass.

### Local document-loading benchmark and SSE check

`test_enterprise_flows` includes a reproducible diagnostic benchmark: five 210 KB extracted documents, 15 runs, PostgreSQL 17/pgvector in local Docker, and the test settings' in-memory cache. The baseline loads all extracted text before bounding the prompt; the new path bounds database text and caches it after checking ownership.

| Median document assembly | Milliseconds |
| --- | ---: |
| Baseline | 9.868 |
| New, cold cache | 11.226 |
| New, warm cache | 2.833 |

Warm assembly was about 71% lower in this run; cold assembly was about 14% higher. This is a microbenchmark, not a Redis or end-to-end chat latency result. Live model/network latency and production capacity still need measurement.

To repeat the isolated Nginx check, build `metanix-enterprise-worker-test:local` from `backend`, ensure `nginx:alpine` is available locally, then run `python backend/tools/check_sse_proxy.py`. It creates and cleans up temporary containers on an internal Docker network, publishes no ports, and reads the current SSE location from `nginx/nginx.conf`.

### Human A/B and live-provider acceptance

Compare the pre-upgrade baseline and candidate using the same model/version, temperature, user permissions, document versions, and fixed prompt sequence. Record context/search/semantic settings and token counts separately so the larger default budget remains visible. Blind the response labels for human review. Run each applicable case through **both regular chat and SSE**.

| Case | Fixed exercise | Review criteria |
| --- | --- | --- |
| Long conversation | Across 12+ turns, plan a training event with a named venue, budget, and accessibility constraints; briefly discuss catering, then request the final plan. | Preserve relevant constraints, incorporate corrections, and avoid importing unrelated facts. |
| Language switch | Continue that conversation with a Hindi paraphrase asking how the accessibility constraint changes the plan, then return to English. | Correct reference resolution, useful history recall, and appropriate response language. Compare semantic context off/on with the chosen multilingual embedding model. |
| Explicit reset | Say `New topic: explain binary search` after the planning conversation. | No accidental event-plan carryover; runnable code and concise explanation when requested. |
| Memory relevance | Seed a durable preference for vegetarian meals, then ask for conference lunch options and an unrelated sorting algorithm. | Use relevant preference only where helpful; no irrelevant memory insertion. |
| Current information | Ask for the latest published release of a selected product and its publication date; retain the official source URL and retrieval date as the dated answer key. | Model chooses search, cites actually returned evidence, distinguishes dates, and does not claim verification when the search service fails. |
| Timeless request | Ask `Why does a triangle have three sides?` and `Rewrite this sentence more clearly: The meeting will occur tomorrow.` | Zero search calls; no separate routing-model request. |
| Company policy | Upload an invented policy with a unique reimbursement amount and policy identifier; ask the travel reimbursement question. | Exact supplied policy, correct title/version/passage citations, and no generic substituted policy. |
| Denied/no evidence | Ask the same question as an ungranted employee; then ask an unrelated policy question as an authorized employee. | No restricted source content or invented company policy. |
| Replacement/revocation | Replace the policy with a new amount, then revoke the employee grant and ask again in the existing chat. | Current version only before revocation; no replay of prior evidence on a subsequent model request after revocation. Previously displayed answers are already disclosed and are not retroactively erased. |
| Converter fidelity | Use real company DOCX tables, XLSX print areas, scanned multilingual policies, encrypted PDFs, and batch merge/split jobs. | Openable downloads, readable OCR, preserved content/layout within agreed tolerances, correct order/page counts, and specific failure messages. |

Have reviewers score correctness, context retention, grounding/citations, formatting, and unnecessary clarification on a fixed 1-5 scale. Record missing evidence and denied-access behavior as pass/fail. Retain prompt fixtures, provider identity, setting snapshots, output files, scores, and actual invoice/usage observations in the deployment evaluation record.

### Latency and capacity acceptance

Measure request start -> first text token and request start -> final response separately. Capture at least 30 warm runs per fixed prompt/provider at concurrency 1, 5, and 10; report median and p95, errors, token counts, search attempts, and worker queue depth. Keep a separate cold-cache sample. Repeat with concurrent large document jobs and through the actual Nginx/ingress route.

Use `chat_stage` timings to distinguish provider lookup, context, document loading, knowledge retrieval, provider completion, and usage writes. Search-enabled native streams report `first_token_ms` in their result; browser/proxy timing is still needed for complete end-to-end time. A local mocked benchmark isolates application work and cannot establish real provider/network latency or the brief's median-response improvement requirement.

## Remaining practical limits

- Company Knowledge questions currently use only the latest question plus newly authorized passages. Earlier answers, conversation summaries, and durable memory are excluded to prevent replay after permission changes. Follow-ups should restate the policy subject; conversational query rewriting is not implemented.
- Knowledge management lists at most 200 documents, has no pagination or bulk reindexing, and uses exact vector search. Evaluate real corpus size before setting enterprise scale expectations. Keyword reranking is bounded candidate reranking, not full-text hybrid retrieval across the entire corpus.
- Retrieval source labels and model grounding instructions do not mathematically enforce every generated claim. Human/source checks remain necessary to validate answer quality and prompt-injection resistance.
- Native tool adapters have fixture coverage, but actual model/deployment compatibility, credential configuration, vendor quota behavior, and tool-use quality require live calls. Prompt-cache savings, multilingual embedding quality, and real search accuracy remain unmeasured.
- WSGI remains synchronous. Queue separation and subprocess limits reduce contention but do not prove that conversion cannot degrade chat on shared hardware. Production worker sizing and the complete TLS/ingress SSE path need the load checks above; the isolated Nginx location check already passes.
- PDF conversion and OCR fidelity depend on fonts, layout, scan quality, and language packages. No comprehensive converter parity, antivirus pipeline, compliance certification, or fully isolated hostile-document processing is claimed.

## Runtime web-search validation and quota handling

Gemini web search was activated and verified through the running SSE chat endpoint: two searches returned eight sources and a completion event without search errors. Subsequent Gemini requests returned HTTP 429 with `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, reporting a 20-request daily project/model limit. This is the observed account limit, not a universal Gemini allowance. Search rounds, background model work, and validation calls share that provider quota.

Regular and streaming chat now report a safe, specific daily-quota message instead of a generic failure. No automatic retry loop can resolve an exhausted daily allowance. The 41 targeted web/enterprise regression tests pass after this change.

## Converter download follow-up

The latest completed TXT-to-PDF output was present and returned HTTP 200 with a valid PDF header through the authenticated application test client. Converter buttons now construct download requests using the same API base address as upload/status requests, rather than trusting an absolute URL derived from a proxy host. The shared client retains bearer-token refresh and reports missing files, expired sessions, and incorrect proxy responses separately. Browser object URLs are revoked after a delay. Four Node regression tests cover origin selection, authentication refresh, status errors, and unexpected HTML responses: `node --test Frontend/tests/converter-download.test.cjs`. Live browser verification remains outstanding; the additional authenticated HTTP diagnostic was blocked by automatic approval review quota.

## Finding PDF utilities

The converter now shows a visible tool grid above single-file conversion. Select Split into pages, Remove password, Merge PDFs, or another operation to open its file and options panel. A PDF already selected in the converter can be reused. Split produces a ZIP of individual pages; removing password protection requires the current password.
