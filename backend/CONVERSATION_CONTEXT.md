# Conversation context

Both regular and streaming chat use `admin_portal/conversation_context.py`.
The response policy is appended even when an administrator configured a custom
prompt. Specialized output contracts, including presentation JSON, remain supported.
Claude receives policy in its top-level `system` parameter in both response modes.

History defaults to 24 messages and approximately 12,000 tokens, configurable with
`CHAT_CONTEXT_MAX_MESSAGES`, `CHAT_CONTEXT_TOKEN_BUDGET`, and provider `extra_config`.
This doubles the previous default allowance and may increase input-token costs.
When a model context window is configured, system/document text and expected output
are reserved before allocating history. Oversized mandatory input produces an error.

Only explicit reset phrases start a new context scope. Topic drift, paraphrases, and
language switches preserve history. Optional `CHAT_SEMANTIC_CONTEXT` recalls related
earlier exchanges without using similarity to discard history. Stored messages are
never deleted by context assembly.

Summarization runs through the existing background tasks, after at least four messages
leave the window (or roughly 3,000 tokens are evicted). Each call handles at most 24
messages and approximately 24,000 characters, retains recent messages verbatim, and
records the timestamp of the last covered message. Oversized individual summary inputs
are explicitly marked as excerpts. Summaries are historical user-context notes, not
system instructions. Results from an old topic are discarded if the topic changes
during the call. Until the background task catches up, older evicted details may be
unavailable in model context. Failed summaries do not delete stored history.

Cross-chat memory is included when relevant, using lexical matching by default and
optional embedding relevance with `CHAT_SEMANTIC_MEMORY`. Existing memory extraction
remains enabled. Company Knowledge excludes previous answers, summaries, and memory;
it uses the latest question with newly authorized evidence. Legacy summaries without
a reliable covered-message timestamp are rebuilt from stored messages.

For embedding configuration, provider overrides, cost changes, migrations, and the
PostgreSQL/worker test results, see [Enterprise upgrade](ENTERPRISE_UPGRADE.md).

## Deployment

Run `python manage.py migrate` from `backend`, then restart the web service and Celery
workers. Migration `0036_conversation_context` adds three nullable timestamp fields.
No provider/model replacement or new external service is required.

## Verification

From the repository root on Windows:

```powershell
.\venv\Scripts\python.exe backend/manage.py test admin_portal.test_conversation_context admin_portal.tests --settings=multimodel.test_context_settings
```

Tests use an isolated in-memory SQLite database and mocked provider calls. Production
PostgreSQL migrations are not exercised by this test settings module.
