"""
Universal LLM Engine — direct httpx for all provider calls.

Design decision:
  - All HTTP calls use a single persistent httpx.Client with HTTP/2 and keepalive.
    This eliminates TCP+TLS handshake overhead (~200-500ms) on repeated requests.

Provider routing is done via a registry (_PROVIDER_HANDLERS / _STREAM_HANDLERS).
Each handler is a simple function that builds the request, calls _http_client, and
parses the response. All retry logic uses the shared _with_retry() helper.
"""
import logging
import os
import re
import time
from typing import Optional
from urllib.parse import urlparse

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  Retry configuration
# ---------------------------------------------------------------------------
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.0
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _with_retry(fn, *args, **kwargs):
    """
    Execute a callable with automatic retry on transient LLM API errors.

    Uses exponential backoff: RETRY_BACKOFF_BASE * (2 ** attempt).
    Respects the Retry-After header on 429 responses.
    Never retries 400/401/403 — those are config errors that won't self-fix.
    """
    last_exc = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            status = exc.response.status_code
            if status not in RETRYABLE_STATUS_CODES:
                raise
            if attempt == MAX_RETRIES:
                logger.error("LLM API failed after %d retries. Status: %d", MAX_RETRIES, status)
                raise
            retry_after = exc.response.headers.get('Retry-After')
            wait = float(retry_after) if retry_after else RETRY_BACKOFF_BASE * (2 ** attempt)
            logger.warning("LLM API %d (attempt %d/%d). Retrying in %.1fs...",
                           status, attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
        except httpx.TimeoutException as exc:
            last_exc = exc
            if attempt == MAX_RETRIES:
                logger.error("LLM API timed out after %d retries.", MAX_RETRIES)
                raise
            wait = RETRY_BACKOFF_BASE * (2 ** attempt)
            logger.warning("LLM timeout (attempt %d/%d). Retrying in %.1fs...",
                           attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
    raise last_exc


# ---------------------------------------------------------------------------
#  Persistent HTTP client — single instance, shared across all provider calls.
#
#  Benefits over creating a new client per call:
#    - TCP keepalive: reuses existing TCP connections (~100-300ms saved per req)
#    - TLS session resumption: skips full TLS handshake on reconnect (~50-150ms)
#    - HTTP/2 multiplexing: multiple requests on one connection (Azure supports it)
#    - Connection pool: up to 50 concurrent connections, 20 kept warm
# ---------------------------------------------------------------------------
_http_client = httpx.Client(
    timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0),
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=120),
    http2=True,
)


# ---------------------------------------------------------------------------
#  Provider-specific HTTP handlers — direct calls, zero wrapper overhead
# ---------------------------------------------------------------------------

def _call_azure_openai(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """Azure OpenAI — direct HTTP to the Chat Completions deployment endpoint."""
    api_version = provider.api_version or getattr(settings, 'AZURE_OPENAI_API_VERSION', '2024-06-01')
    deployment = provider.extra_config.get('deployment') or getattr(settings, 'AZURE_OPENAI_DEPLOYMENT', None) or model
    base_url = (endpoint or getattr(settings, 'AZURE_OPENAI_ENDPOINT', '')).rstrip('/')
    key = api_key or getattr(settings, 'AZURE_OPENAI_API_KEY', '')
    url = f"{base_url}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    headers = {'api-key': key, 'Content-Type': 'application/json'}
    payload = {'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    logger.info("Azure OpenAI -> %s (deployment=%s)", url[:80], deployment)
    resp = _http_client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return _parse_openai_response(resp.json(), model)


def _call_openai(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """OpenAI — direct HTTP to the Chat Completions API."""
    key = api_key or getattr(settings, 'OPENAI_API_KEY', '')
    base_url = (endpoint or 'https://api.openai.com').rstrip('/')
    url = f"{base_url}/v1/chat/completions"
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    logger.info("OpenAI -> %s (model=%s)", url[:80], model)
    resp = _http_client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return _parse_openai_response(resp.json(), model)


def _call_google(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """Google Gemini — direct HTTP to the generateContent API."""
    key = api_key or getattr(settings, 'GEMINI_API_KEY', '')
    clean_model = model.removeprefix('gemini/')
    base_url = (endpoint or 'https://generativelanguage.googleapis.com').rstrip('/')
    url = f"{base_url}/v1beta/models/{clean_model}:generateContent?key={key}"
    system_text = ''
    contents = []
    for msg in messages:
        role = msg.get('role', 'user')
        text = msg.get('content', '')
        if role == 'system':
            system_text += text + '\n'
        else:
            contents.append({'role': 'model' if role == 'assistant' else 'user',
                             'parts': [{'text': text}]})
    payload = {'contents': contents,
               'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}}
    if system_text.strip():
        payload['systemInstruction'] = {'parts': [{'text': system_text.strip()}]}
    logger.info("Google Gemini -> %s (model=%s)", url[:80], clean_model)
    resp = _http_client.post(url, headers={'Content-Type': 'application/json'}, json=payload)
    resp.raise_for_status()
    data = resp.json()
    content = ''
    if 'candidates' in data and data['candidates']:
        content = ''.join(p.get('text', '') for p in
                         data['candidates'][0].get('content', {}).get('parts', []))
    usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    if 'usageMetadata' in data:
        u = data['usageMetadata']
        usage = {'prompt_tokens': u.get('promptTokenCount', 0),
                 'completion_tokens': u.get('candidatesTokenCount', 0),
                 'total_tokens': u.get('totalTokenCount', 0)}
    return {'content': content, 'usage': usage, 'model': model}


def _call_anthropic(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """Anthropic Claude — direct HTTP to the Messages API."""
    key = api_key or getattr(settings, 'CLAUDE_API_KEY', '')
    clean_model = model.removeprefix('anthropic/')
    base_url = (endpoint or 'https://api.anthropic.com').rstrip('/')
    if base_url.endswith('/v1/messages'):
        base_url = base_url[:-len('/v1/messages')]
    url = f"{base_url}/v1/messages"
    headers = {'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'}
    system_text = ''
    api_messages = []
    for msg in messages:
        role = msg.get('role', 'user')
        if role == 'system':
            system_text += msg.get('content', '') + '\n'
        else:
            api_messages.append({'role': role, 'content': msg.get('content', '')})
    payload = {'model': clean_model, 'messages': api_messages,
               'max_tokens': max_tokens or 4096, 'temperature': temperature}
    if system_text.strip():
        # Anthropic only caches what's explicitly marked — unlike Azure OpenAI's
        # automatic prefix caching. The system prompt (identity + memory + summary)
        # is the largest block that's identical on every turn of a conversation,
        # so it's the highest-value (and simplest) thing to mark cacheable.
        payload['system'] = [{'type': 'text', 'text': system_text.strip(),
                              'cache_control': {'type': 'ephemeral'}}]
    logger.info("Anthropic -> %s (model=%s)", url[:80], clean_model)
    resp = _http_client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    data = resp.json()
    content = ''.join(b.get('text', '') for b in data.get('content', [])
                      if b.get('type') == 'text')
    u = data.get('usage', {})
    inp, out = u.get('input_tokens', 0), u.get('output_tokens', 0)
    cached = u.get('cache_read_input_tokens', 0) or 0
    return {'content': content,
            'usage': {'prompt_tokens': inp, 'cached_tokens': cached, 'completion_tokens': out, 'total_tokens': inp + out},
            'model': model}


def _call_ollama(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """Ollama (local) — direct HTTP to the native /api/chat endpoint."""
    base_url = (endpoint or getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')).rstrip('/')
    url = f"{base_url}/api/chat"
    payload = {'model': model, 'messages': messages, 'stream': False,
               'options': {'temperature': temperature}}
    if max_tokens:
        payload['options']['num_predict'] = max_tokens
    logger.info("Ollama -> %s (model=%s)", url[:80], model)
    resp = _http_client.post(url, headers={'Content-Type': 'application/json'}, json=payload)
    resp.raise_for_status()
    data = resp.json()
    content = data.get('message', {}).get('content', '')
    pe = data.get('prompt_eval_count', 0) or 0
    ec = data.get('eval_count', 0) or 0
    return {'content': content,
            'usage': {'prompt_tokens': pe, 'completion_tokens': ec, 'total_tokens': pe + ec},
            'model': model}


def _call_huggingface(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """HuggingFace Inference API — OpenAI-compatible chat completions endpoint."""
    key = api_key or getattr(settings, 'HUGGINGFACE_API_KEY', '')
    base_url = (endpoint or 'https://router.huggingface.co').rstrip('/')
    url = f"{base_url}/v1/chat/completions"
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens,
               'temperature': temperature, 'stream': False}
    logger.info("HuggingFace -> %s (model=%s)", url[:80], model)
    resp = _http_client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return _parse_openai_response(resp.json(), model)


def _is_responses_api(uri: str) -> bool:
    """Detect if a Target URI uses the Azure OpenAI Responses API."""
    path = urlparse(uri).path.rstrip('/')
    return path.endswith('/responses')


def _build_azure_target_uri(endpoint: str, model: str, api_version: str) -> str:
    """
    Auto-build the full Azure endpoint URL when admin provides just a base URL.
    If endpoint already ends with a known API action path, return it as-is (adding
    api-version if missing). Otherwise rebuild from scheme://host.
    """
    parsed = urlparse(endpoint)
    path = parsed.path.rstrip('/')
    if path.endswith('/chat/completions') or path.endswith('/responses') or path.endswith('/completions'):
        if 'api-version' not in (parsed.query or ''):
            version = api_version or '2024-12-01-preview'
            sep = '&' if parsed.query else '?'
            return f"{endpoint.rstrip('?&')}{sep}api-version={version}"
        return endpoint
    base = f"{parsed.scheme}://{parsed.netloc}"
    version = api_version or '2024-12-01-preview'
    return f"{base}/openai/deployments/{model}/chat/completions?api-version={version}"


def _call_azure_ai_foundry(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """
    Azure AI Foundry — direct HTTP, fully DB-driven.
    Handles both Chat Completions and Responses API endpoints.
    Auto-detects endpoint type and retries once if a 400 is caused by an
    unsupported parameter (e.g. GPT-5.2 rejects temperature != 1).
    """
    target_uri = endpoint
    if not target_uri:
        raise ValueError('Azure AI Foundry models require an Endpoint URL in the API endpoint field.')
    api_version = getattr(provider, 'api_version', '') or ''
    target_uri = _build_azure_target_uri(target_uri, model, api_version)
    key = api_key or getattr(settings, 'AZURE_OPENAI_API_KEY', '')
    headers = {'api-key': key, 'Content-Type': 'application/json'}
    use_responses_api = _is_responses_api(target_uri)

    if use_responses_api:
        payload = {'model': model, 'input': messages, 'temperature': temperature}
        if max_tokens:
            payload['max_output_tokens'] = max_tokens
        logger.info("Azure AI Foundry (Responses API) -> %s (model=%s)", target_uri[:80], model)
    else:
        payload = {'messages': messages, 'temperature': temperature, 'model': model}
        if max_tokens:
            payload['max_completion_tokens'] = max_tokens
        logger.info("Azure AI Foundry (Chat Completions) -> %s (model=%s)", target_uri[:80], model)

    resp = _http_client.post(target_uri, headers=headers, json=payload)

    # On 400, try stripping the offending unsupported param and retry once
    if resp.status_code == 400:
        try:
            err_obj = resp.json().get('error', {})
            err_msg = str(err_obj.get('message', ''))
            err_param = err_obj.get('param', '')
        except Exception:
            err_msg, err_param = resp.text, ''
        err_lower = err_msg.lower()
        if 'unsupported' in err_lower or 'unrecognized' in err_lower:
            bad_param = err_param if err_param and err_param in payload else None
            if not bad_param:
                match = (re.search(r"'(\w+)'(?:\s+does not support|\s+is not supported)", err_msg)
                         or re.search(r"[Uu]nsupported (?:parameter|value):\s*'(\w+)'", err_msg)
                         or re.search(r"[Uu]nrecognized request argument.*?:\s*(\w+)", err_msg))
                bad_param = match.group(1) if match and match.group(1) in payload else None
            if bad_param:
                logger.info("Retrying without unsupported param '%s' for model %s", bad_param, model)
                del payload[bad_param]
                resp = _http_client.post(target_uri, headers=headers, json=payload)

    resp.raise_for_status()
    data = resp.json()
    content = ''
    usage = {'prompt_tokens': 0, 'cached_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}

    if use_responses_api:
        for item in data.get('output', []):
            if item.get('type') == 'message':
                for block in item.get('content', []):
                    if block.get('type') == 'output_text':
                        content += block.get('text', '')
        if not content:
            for item in data.get('output', []):
                c = item.get('content', '')
                if isinstance(c, str):
                    content += c
        if 'usage' in data:
            u = data['usage']
            usage = {'prompt_tokens': u.get('input_tokens', 0) or u.get('prompt_tokens', 0),
                     'cached_tokens': (u.get('input_tokens_details') or {}).get('cached_tokens', 0) or 0,
                     'completion_tokens': u.get('output_tokens', 0) or u.get('completion_tokens', 0),
                     'total_tokens': u.get('total_tokens', 0)}
    else:
        if 'choices' in data and data['choices']:
            msg = data['choices'][0].get('message', {})
            content = msg.get('content') or msg.get('reasoning_content') or ''
        if 'usage' in data:
            u = data['usage']
            usage = {'prompt_tokens': u.get('prompt_tokens', 0),
                     'cached_tokens': (u.get('prompt_tokens_details') or {}).get('cached_tokens', 0) or 0,
                     'completion_tokens': u.get('completion_tokens', 0),
                     'total_tokens': u.get('total_tokens', 0)}

    return {'content': content, 'usage': usage, 'model': model}


def _call_openai_compatible(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    """Generic fallback for any OpenAI-compatible API (custom provider type)."""
    if not api_key and provider.extra_config.get('api_key'):
        api_key = provider.extra_config['api_key']
    base_url = (endpoint or '').rstrip('/')
    url = base_url if '/chat/completions' in base_url else f"{base_url}/v1/chat/completions"
    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    logger.info("OpenAI-compatible -> %s (model=%s)", url[:80], model)
    resp = _http_client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return _parse_openai_response(resp.json(), model)


# ---------------------------------------------------------------------------
#  Response parser
# ---------------------------------------------------------------------------

def _parse_openai_response(data: dict, model: str) -> dict:
    """Parse a standard OpenAI-format chat completion response."""
    content = ''
    if 'choices' in data and data['choices']:
        msg = data['choices'][0].get('message', {})
        content = msg.get('content') or msg.get('reasoning_content') or ''
    usage = {'prompt_tokens': 0, 'cached_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    if 'usage' in data:
        u = data['usage']
        usage = {'prompt_tokens': u.get('prompt_tokens', 0),
                 'cached_tokens': (u.get('prompt_tokens_details') or {}).get('cached_tokens', 0) or 0,
                 'completion_tokens': u.get('completion_tokens', 0),
                 'total_tokens': u.get('total_tokens', 0)}
    return {'content': content, 'usage': usage, 'model': model}


# ---------------------------------------------------------------------------
#  Handler registry
# ---------------------------------------------------------------------------

_PROVIDER_HANDLERS = {
    'azure_openai':     _call_azure_openai,
    'azure_ai_foundry': _call_azure_ai_foundry,
    'openai':           _call_openai,
    'google':           _call_google,
    'anthropic':        _call_anthropic,
    'ollama':           _call_ollama,
    'huggingface':      _call_huggingface,
    'custom':           _call_openai_compatible,
}


# ---------------------------------------------------------------------------
#  Main public API — non-streaming
# ---------------------------------------------------------------------------

def call_llm(provider, messages: list, **kwargs) -> dict:
    """
    Route a chat completion request to the correct LLM backend.

    Returns:
        {"content": str, "usage": {...}, "model": str, "latency_ms": int}
    """
    api_key = provider.get_api_key()
    model = provider.model_name
    endpoint = provider.api_endpoint
    max_tokens = kwargs.pop('max_tokens', provider.max_tokens)
    temperature = kwargs.pop('temperature', provider.temperature)

    start = time.time()
    handler = _PROVIDER_HANDLERS.get(provider.provider_type, _call_openai_compatible)
    result = _with_retry(
        handler,
        provider=provider, messages=messages, api_key=api_key,
        model=model, endpoint=endpoint, max_tokens=max_tokens, temperature=temperature,
        **kwargs,
    )
    result['latency_ms'] = int((time.time() - start) * 1000)
    result.setdefault('model', model)
    return result


# ---------------------------------------------------------------------------
#  Streaming handlers
# ---------------------------------------------------------------------------

def _stream_openai_sse(*, url, headers, payload):
    """
    Parse an OpenAI-format SSE stream.
    Yields text chunks (str), then a final usage dict.
    """
    payload = {**payload, 'stream': True, 'stream_options': {'include_usage': True}}
    usage = {'prompt_tokens': 0, 'cached_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    import json
    with _http_client.stream('POST', url, headers=headers, json=payload) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            if line == 'data: [DONE]':
                break
            data_str = line[6:] if line.startswith('data: ') else None
            if not data_str or data_str == '[DONE]':
                continue
            try:
                data = json.loads(data_str)
                if data.get('usage'):
                    u = data['usage']
                    usage = {'prompt_tokens': u.get('prompt_tokens', 0),
                             'cached_tokens': (u.get('prompt_tokens_details') or {}).get('cached_tokens', 0) or 0,
                             'completion_tokens': u.get('completion_tokens', 0),
                             'total_tokens': u.get('total_tokens', 0)}
                choices = data.get('choices', [])
                if choices:
                    content = choices[0].get('delta', {}).get('content', '')
                    if content:
                        yield content
            except (json.JSONDecodeError, KeyError):
                pass
    yield {'usage': usage}


def _stream_azure_openai(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    api_version = provider.api_version or getattr(settings, 'AZURE_OPENAI_API_VERSION', '2024-06-01')
    deployment = provider.extra_config.get('deployment') or getattr(settings, 'AZURE_OPENAI_DEPLOYMENT', None) or model
    base_url = (endpoint or getattr(settings, 'AZURE_OPENAI_ENDPOINT', '')).rstrip('/')
    key = api_key or getattr(settings, 'AZURE_OPENAI_API_KEY', '')
    url = f"{base_url}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    headers = {'api-key': key, 'Content-Type': 'application/json'}
    payload = {'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    yield from _stream_openai_sse(url=url, headers=headers, payload=payload)


def _stream_azure_ai_foundry(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    if not endpoint:
        raise ValueError('Azure AI Foundry models require an Endpoint URL.')
    api_version = getattr(provider, 'api_version', '') or ''
    target_uri = _build_azure_target_uri(endpoint, model, api_version)
    key = api_key or getattr(settings, 'AZURE_OPENAI_API_KEY', '')
    headers = {'api-key': key, 'Content-Type': 'application/json'}
    if _is_responses_api(target_uri):
        yield from _stream_azure_responses_api(
            url=target_uri, headers=headers, model=model,
            messages=messages, max_tokens=max_tokens, temperature=temperature)
        return
    payload = {'messages': messages, 'temperature': temperature, 'model': model}
    if max_tokens:
        payload['max_completion_tokens'] = max_tokens
    yield from _stream_openai_sse(url=target_uri, headers=headers, payload=payload)


def _stream_azure_responses_api(*, url, headers, model, messages, max_tokens, temperature):
    """
    Stream from the Azure/OpenAI Responses API (used by newer models such as
    GPT-5.2). This was previously assumed not to support streaming and
    silently fell back to a single batch call — it does support it, the
    event schema is just different from Chat Completions: text arrives via
    `response.output_text.delta` events (field `delta`) instead of
    `choices[0].delta.content`, and final usage via a `response.completed`
    event nested at `response.usage` instead of a top-level `usage` key.

    Mirrors _call_azure_ai_foundry's one-shot retry: some models (e.g.
    GPT-5.2) reject a non-default `temperature`. The batch path already
    handles this; without the same handling here, streaming would just
    fail a different way instead of actually working.
    """
    import json

    def make_payload(include_temperature):
        payload = {'model': model, 'input': messages, 'stream': True}
        if include_temperature:
            payload['temperature'] = temperature
        if max_tokens:
            payload['max_output_tokens'] = max_tokens
        return payload

    def parse_events(resp):
        usage = {'prompt_tokens': 0, 'cached_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
        for line in resp.iter_lines():
            if not line or not line.startswith('data: '):
                continue
            data_str = line[6:]
            if data_str == '[DONE]':
                continue
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            event_type = data.get('type', '')
            if event_type == 'response.output_text.delta':
                delta = data.get('delta', '')
                if delta:
                    yield delta
            elif event_type == 'response.completed':
                u = (data.get('response') or {}).get('usage', {})
                usage = {
                    'prompt_tokens': u.get('input_tokens', 0),
                    'cached_tokens': (u.get('input_tokens_details') or {}).get('cached_tokens', 0) or 0,
                    'completion_tokens': u.get('output_tokens', 0),
                    'total_tokens': u.get('total_tokens', 0),
                }
            elif event_type in ('response.failed', 'response.incomplete', 'error'):
                err = (data.get('response') or {}).get('error') or data.get('error') or {}
                raise RuntimeError(err.get('message') or f'Responses API stream error: {event_type}')
        yield {'usage': usage}

    needs_retry_without_temperature = False
    with _http_client.stream('POST', url, headers=headers, json=make_payload(True)) as resp:
        if resp.status_code == 400:
            resp.read()
            try:
                err_msg = str(resp.json().get('error', {}).get('message', ''))
            except Exception:
                err_msg = resp.text
            if 'temperature' in err_msg.lower():
                needs_retry_without_temperature = True
                logger.info("Retrying Responses API stream without unsupported 'temperature' for model %s", model)
            else:
                resp.raise_for_status()
        else:
            resp.raise_for_status()
            yield from parse_events(resp)
            return

    if needs_retry_without_temperature:
        with _http_client.stream('POST', url, headers=headers, json=make_payload(False)) as resp:
            resp.raise_for_status()
            yield from parse_events(resp)


def _stream_openai(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    key = api_key or getattr(settings, 'OPENAI_API_KEY', '')
    base_url = (endpoint or 'https://api.openai.com').rstrip('/')
    url = f"{base_url}/v1/chat/completions"
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    yield from _stream_openai_sse(url=url, headers=headers, payload=payload)


def _stream_huggingface(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    key = api_key or getattr(settings, 'HUGGINGFACE_API_KEY', '')
    base_url = (endpoint or 'https://router.huggingface.co').rstrip('/')
    url = f"{base_url}/v1/chat/completions"
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    yield from _stream_openai_sse(url=url, headers=headers, payload=payload)


def _stream_openai_compatible(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    if not api_key and provider.extra_config.get('api_key'):
        api_key = provider.extra_config['api_key']
    base_url = (endpoint or '').rstrip('/')
    url = base_url if '/chat/completions' in base_url else f"{base_url}/v1/chat/completions"
    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}
    yield from _stream_openai_sse(url=url, headers=headers, payload=payload)


def _stream_anthropic(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    import json
    key = api_key or getattr(settings, 'CLAUDE_API_KEY', '')
    clean_model = model.removeprefix('anthropic/')
    base_url = (endpoint or 'https://api.anthropic.com').rstrip('/')
    if base_url.endswith('/v1/messages'):
        base_url = base_url[:-len('/v1/messages')]
    url = f"{base_url}/v1/messages"
    headers = {'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'}
    system_text = ''
    api_messages = []
    for msg in messages:
        role = msg.get('role', 'user')
        if role == 'system':
            system_text += msg.get('content', '') + '\n'
        else:
            api_messages.append({'role': role, 'content': msg.get('content', '')})
    payload = {'model': clean_model, 'messages': api_messages,
               'max_tokens': max_tokens or 4096, 'temperature': temperature, 'stream': True}
    if system_text.strip():
        # See _call_anthropic — the system prompt is the largest turn-to-turn-stable
        # block, so it's marked as the cache breakpoint.
        payload['system'] = [{'type': 'text', 'text': system_text.strip(),
                              'cache_control': {'type': 'ephemeral'}}]
    usage = {'prompt_tokens': 0, 'cached_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    with _http_client.stream('POST', url, headers=headers, json=payload) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line or not line.startswith('data: '):
                continue
            try:
                data = json.loads(line[6:])
                evt = data.get('type', '')
                if evt == 'content_block_delta':
                    text = data.get('delta', {}).get('text', '')
                    if text:
                        yield text
                elif evt == 'message_start':
                    u = data.get('message', {}).get('usage', {})
                    usage['prompt_tokens'] = u.get('input_tokens', 0)
                    usage['cached_tokens'] = u.get('cache_read_input_tokens', 0) or 0
                elif evt == 'message_delta':
                    out = data.get('usage', {}).get('output_tokens', 0)
                    usage['completion_tokens'] = out
                    usage['total_tokens'] = usage['prompt_tokens'] + out
            except (json.JSONDecodeError, KeyError):
                pass
    yield {'usage': usage}


def _stream_google(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    import json
    key = api_key or getattr(settings, 'GEMINI_API_KEY', '')
    clean_model = model.removeprefix('gemini/')
    base_url = (endpoint or 'https://generativelanguage.googleapis.com').rstrip('/')
    url = f"{base_url}/v1beta/models/{clean_model}:streamGenerateContent?key={key}&alt=sse"
    system_text = ''
    contents = []
    for msg in messages:
        role = msg.get('role', 'user')
        text = msg.get('content', '')
        if role == 'system':
            system_text += text + '\n'
        else:
            contents.append({'role': 'model' if role == 'assistant' else 'user',
                             'parts': [{'text': text}]})
    payload = {'contents': contents,
               'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}}
    if system_text.strip():
        payload['systemInstruction'] = {'parts': [{'text': system_text.strip()}]}
    usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    with _http_client.stream('POST', url, headers={'Content-Type': 'application/json'}, json=payload) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line or not line.startswith('data: '):
                continue
            try:
                data = json.loads(line[6:])
                for part in data.get('candidates', [{}])[0].get('content', {}).get('parts', []):
                    if part.get('text'):
                        yield part['text']
                if 'usageMetadata' in data:
                    u = data['usageMetadata']
                    usage = {'prompt_tokens': u.get('promptTokenCount', 0),
                             'completion_tokens': u.get('candidatesTokenCount', 0),
                             'total_tokens': u.get('totalTokenCount', 0)}
            except (json.JSONDecodeError, KeyError):
                pass
    yield {'usage': usage}


def _stream_ollama(*, provider, messages, api_key, model, endpoint, max_tokens, temperature, **kw):
    import json
    base_url = (endpoint or getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')).rstrip('/')
    url = f"{base_url}/api/chat"
    payload = {'model': model, 'messages': messages, 'stream': True,
               'options': {'temperature': temperature}}
    if max_tokens:
        payload['options']['num_predict'] = max_tokens
    usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    with _http_client.stream('POST', url, headers={'Content-Type': 'application/json'}, json=payload) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            try:
                data = json.loads(line)
                if data.get('message', {}).get('content'):
                    yield data['message']['content']
                if data.get('done'):
                    pe = data.get('prompt_eval_count', 0) or 0
                    ec = data.get('eval_count', 0) or 0
                    usage = {'prompt_tokens': pe, 'completion_tokens': ec, 'total_tokens': pe + ec}
                    break
            except (json.JSONDecodeError, KeyError):
                pass
    yield {'usage': usage}


_STREAM_HANDLERS = {
    'azure_openai':     _stream_azure_openai,
    'azure_ai_foundry': _stream_azure_ai_foundry,
    'openai':           _stream_openai,
    'google':           _stream_google,
    'anthropic':        _stream_anthropic,
    'ollama':           _stream_ollama,
    'huggingface':      _stream_huggingface,
    'custom':           _stream_openai_compatible,
}


# ---------------------------------------------------------------------------
#  Main public API — streaming
# ---------------------------------------------------------------------------

def stream_llm(provider, messages: list, **kwargs):
    """
    Stream a chat completion from any provider.

    Yields:
        str:  Text chunks as they arrive from the LLM
        dict: Final item — {"content", "usage", "model", "latency_ms"}
    """
    api_key = provider.get_api_key()
    model = provider.model_name
    endpoint = provider.api_endpoint
    max_tokens = kwargs.pop('max_tokens', provider.max_tokens)
    temperature = kwargs.pop('temperature', provider.temperature)

    stream_handler = _STREAM_HANDLERS.get(provider.provider_type)
    if stream_handler is None:
        # No streaming handler — fall back to batch and yield full content at once
        result = call_llm(provider, messages, max_tokens=max_tokens, temperature=temperature, **kwargs)
        yield result['content']
        yield result
        return

    start = time.time()
    content_parts = []
    final_usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}

    for item in stream_handler(
        provider=provider, messages=messages, api_key=api_key,
        model=model, endpoint=endpoint, max_tokens=max_tokens, temperature=temperature,
        **kwargs,
    ):
        if isinstance(item, str):
            content_parts.append(item)
            yield item
        elif isinstance(item, dict):
            final_usage = item.get('usage', final_usage)

    latency_ms = int((time.time() - start) * 1000)
    full_content = ''.join(content_parts)

    # Word-count token fallback for providers that don't return streaming usage
    if final_usage.get('total_tokens', 0) == 0 and full_content:
        estimated_completion = int(len(full_content.split()) * 1.3)
        prompt_text = ' '.join(m.get('content', '') for m in messages)
        estimated_prompt = int(len(prompt_text.split()) * 1.3)
        final_usage = {
            'prompt_tokens': estimated_prompt,
            'completion_tokens': estimated_completion,
            'total_tokens': estimated_prompt + estimated_completion,
            'estimated': True,
        }

    yield {
        'content': full_content,
        'usage': final_usage,
        'model': model,
        'latency_ms': latency_ms,
    }


# ---------------------------------------------------------------------------
#  System prompt builder
# ---------------------------------------------------------------------------

_EXPORT_FORMAT_LABELS = {
    'docx': 'Word document', 'pdf': 'PDF', 'xlsx': 'Excel spreadsheet',
    'pptx': 'PowerPoint presentation', 'csv': 'CSV file', 'md': 'Markdown file',
}


def get_system_prompt(provider, chat_mode: str = 'general', document_context: Optional[str] = None,
                       export_format: Optional[str] = None) -> str:
    """
    Build the system prompt from DB configuration.
    Priority: AppConfig chat-mode prompt > LLMProvider.system_prompt (general mode
    only) > default.

    A provider's system_prompt is a general tone/personality override, written
    without any of the other modes' technical contracts in mind (e.g. presentation
    mode's requirement that the ENTIRE response be one JSON code block, which the
    PPTX parser depends on). Letting it replace a specialized mode's prompt was
    observed to break slide generation outright — the model answers like a normal
    assistant instead of emitting parseable JSON, and the parser mangles whatever
    prose it gets back instead of failing loudly. So it's scoped to general mode
    only; every other mode always uses its built-in default. AppConfig can still
    override any mode, since setting that key is a deliberate, mode-specific
    decision rather than a general-purpose prompt bleeding into it.
    """
    from .models import AppConfig

    mode_prompt = AppConfig.get(f'system_prompt_{chat_mode}')
    if mode_prompt:
        base_prompt = mode_prompt
    elif chat_mode == 'general' and provider.system_prompt:
        base_prompt = provider.system_prompt
    else:
        base_prompt = _DEFAULT_PROMPTS.get(chat_mode, _DEFAULT_PROMPTS['general'])

    if document_context:
        base_prompt += f"\n\nDocument context:\n{document_context}"

    if export_format:
        # The app renders this reply into a downloadable file automatically
        # right after it's sent — the LLM has no tool call for this and
        # would otherwise (correctly, from its own perspective) tell the
        # user it can't produce files, which reads as broken once the
        # working download link appears under the same message.
        label = _EXPORT_FORMAT_LABELS.get(export_format, export_format)
        base_prompt += (
            f"\n\nThe user asked for this reply as a downloadable {label}. "
            f"Just answer their actual question normally — do not say you "
            f"can't create files or suggest they do it themselves. The "
            f"app will automatically turn your reply into a {label} and "
            f"attach a download link right after you respond."
        )

    return base_prompt


_DEFAULT_PROMPTS = {
    'general': (
        'You are Gini — a sharp, opinionated AI assistant that gives real answers, not textbook summaries.\n\n'

        'RESPONSE PHILOSOPHY:\n'
        'Lead with an insight or direct take, not "here are some tips." '
        'Have a point of view. Be the expert friend who gives you the real answer, not the safe corporate one. '
        'When someone asks the "best way" to do something, give them THE best way with reasoning — not a list of every possible way.\n\n'

        'FORMATTING RULES (apply intelligently based on question complexity):\n'
        '- **Bold** the most critical concepts or principles — not random words\n'
        '- Use numbered lists for sequential steps; bullet points for parallel options\n'
        '- When using numbered lists, ALWAYS use sequential numbers: 1, 2, 3, 4... Never repeat the same number\n'
        '- Use `code` formatting for commands, tools, file names\n'
        '- Add a "---" section break before a closing "Bottom line" or "Reality check" for complex answers\n'
        '- Use 👉 sparingly — only for the single most important rule in a section\n'
        '- For short conversational questions, respond conversationally — no headers needed\n'
        '- For complex how-to questions, use structured headers with numbered sections\n\n'

        'VOICE & TONE:\n'
        '- Confident and direct. Say "use X" not "you might consider X"\n'
        '- Opinionated where expertise allows. Say "this is the most important step" when it is\n'
        '- No filler phrases: never open with "Great question!", "Certainly!", "Of course!"\n'
        '- No generic closings like "I hope this helps!" or "Feel free to ask more questions"\n'
        '- Never pad responses. If it can be said in 3 words, use 3 words\n\n'

        'CONTENT QUALITY:\n'
        '- Give complete, actionable answers — not vague generalities\n'
        '- For technical topics, include real examples (specific tools, platforms, commands)\n'
        '- When recommending a stack or approach, give the OPTIMIZED recommendation, not everything that exists\n'
        '- End complex answers with a "Bottom line" or "Reality check" section that distills the core truth\n'
        '- If unsure about something, say so — but first give your best answer\n'
        '- Match the user\'s language exactly (Hindi, English, or Hinglish — mirror what they use)\n'
    ),
    'code': (
        'You are Gini, an expert coding assistant who writes production-quality code.\n\n'
        'RULES:\n'
        '- Always use markdown code blocks with the correct language tag\n'
        '- When using numbered lists, ALWAYS use sequential numbers: 1, 2, 3, 4... Never repeat the same number\n'
        '- Lead with the solution, then explain it — not the other way around\n'
        '- Point out edge cases, gotchas, and performance implications proactively\n'
        '- Suggest the idiomatic/best-practice approach, not just "a working approach"\n'
        '- No filler. No "Great question!" No "Here is a simple solution:"\n'
        '- Support all major languages and frameworks\n'
        '- If the user\'s code has a bug, fix it and explain what was wrong in one line\n'
        '- Let the code carry the weight — a one-line comment beats a paragraph of prose explaining what the '
        'code already shows; only write prose for the WHY (a non-obvious tradeoff, a gotcha), never the WHAT\n\n'
        'DEBUGGING DISCIPLINE:\n'
        '- A bug report names a symptom, not the cause — trace back to the actual trigger before proposing a fix, '
        'rather than patching where the error surfaced\n'
        '- If the same defect could recur elsewhere (a shared helper, a repeated pattern), say so and fix it at '
        'the root rather than only where it was reported\n'
        '- State your confidence: if you have not verified the fix against the actual failure mode, say what '
        'would confirm it (a specific input, a log line, a test)\n\n'
        'SCOPE DISCIPLINE:\n'
        '- Match the size of the fix to the size of the problem — do not add abstractions, config options, or '
        'error handling for cases the user did not ask about and that cannot occur here\n'
        '- Prefer the smallest correct change; mention what you deliberately left out and when it would be worth adding'
    ),
    'summarize': (
        'You are Gini, a research and analysis assistant. Treat every request in this mode as one that deserves '
        'structured, multi-angle thinking — not a flat summary.\n\n'
        'IMPORTANT — NO LIVE ACCESS: You have no real-time web search or browsing. Every answer draws on your '
        'trained knowledge (and any document text provided in context) as of your training cutoff. Never imply '
        'you looked something up live or checked a current source. If the question depends on something that '
        'may have changed since your cutoff (prices, current events, latest versions), say so plainly.\n\n'
        'METHOD:\n'
        '- Break the question into its real sub-questions before answering — most "analyze X" requests are '
        'several distinct questions wearing one sentence\n'
        '- Cover more than one angle deliberately (e.g. technical + business, short-term + long-term, for + against) '
        'rather than defaulting to a single perspective\n'
        '- Flag your confidence per claim: distinguish well-established fact, reasonable inference, and speculation '
        '— do not present a guess with the same certainty as a known fact\n'
        '- Close with a clear synthesis: what the analysis actually implies, not just a recap of the points made\n\n'
        'FORMAT:\n'
        '- Open with the single most important takeaway — one sentence\n'
        '- Use structured headers/sections for multi-angle analysis; tight bullets for a plain summarization ask\n'
        '- Highlight critical figures, decisions, or conclusions in **bold**\n'
        '- When purely summarizing a provided source (not analyzing), keep it proportional to the source and free '
        'of your own opinions — save synthesis for when the user is asking you to analyze, not just condense\n'
        '- Multi-angle does not mean long: every sentence must add a distinct angle or fact — cut any that '
        'restate a point already made under a different heading'
    ),
    'document': (
        # Deliberately does NOT hand the model an exact quoted escape phrase
        # ("This is not covered in the document.") — verified via direct
        # testing that gpt-4o-mini (though not gpt-4o or Claude) latches onto
        # a quoted fallback string as an easy low-effort answer, reflexively
        # denying even a plainly-present table lookup ("What is the Q2
        # revenue for Widget A?" failed 4/4 trials with the old prompt on a
        # table where that exact row was first in the list). Describing the
        # fallback behavior instead of quoting it, plus an explicit
        # "read tables row by row" nudge and a softened trigger condition
        # ("only after you've actually checked"), fixed it consistently
        # across repeated trials without weakening the two strong models.
        'You are Gini, a document analysis assistant. The full content of the '
        'document(s) the user attached is provided below as "Document context" — '
        'treat it as the complete, authoritative source for this conversation.\n\n'
        'RULES:\n'
        '- Answer using ONLY the document context below — do not infer or hallucinate information not present\n'
        '- If the context contains a table, read it carefully row by row before answering — the answer is often '
        'there even if it takes a moment to find\n'
        '- This applies to open-ended requests too ("analyze", "summarize", "what can you tell me about" this '
        'document) — use the full context to give a real, substantive answer; these are not single-fact lookups\n'
        '- Quote or reference the specific section, heading, or row you are drawing from, not just "the document says"\n'
        '- Only tell the user something is not covered after you have actually checked the full context below and '
        'confirmed it is genuinely absent — never as a first response to an open-ended analysis request\n'
        '- When more than one document is provided: treat them as a set, not independent texts — if they agree, say '
        'so; if they contradict each other, name the contradiction explicitly rather than silently picking one'
    ),
    'presentation': '''CRITICAL: You are a PPTX slide generator. Your ENTIRE response must be a SINGLE JSON code block and NOTHING ELSE. No explanations, no markdown, no text before or after the JSON. If you output anything other than JSON, the system will break.

Respond with ONLY this format (no other text):
```json
{"theme": "...", "style_suggestions": [...], "slides": [...]}
```

JSON structure:
- "theme": pick one of: midnight, sunset, forest, ocean, royal, clean_light, coral, arctic, neon, corporate, bold, rose_gold, volcano, slate
- "style_suggestions": array of 3 short enhancement tips like "Try: Use a warm sunset theme"
- "slides": array of slide objects, each with a "layout" field

Slide layouts:
- title: {"layout":"title", "title":"...", "subtitle":"...", "author":"..."}
- section: {"layout":"section", "title":"...", "subtitle":"...", "section_number":"01"}
- content: {"layout":"content", "title":"...", "points":["..."], "speaker_note":"..."}
- two_column: {"layout":"two_column", "title":"...", "left_column":{"title":"...","points":[...]}, "right_column":{"title":"...","points":[...]}, "speaker_note":"..."}
- key_metrics: {"layout":"key_metrics", "title":"...", "metrics":[{"value":"42%","label":"Growth","description":"YoY"}], "speaker_note":"..."}
- timeline: {"layout":"timeline", "title":"...", "steps":[{"title":"Step 1","description":"..."}], "speaker_note":"..."}
- quote: {"layout":"quote", "quote":"...", "author":"...", "speaker_note":"..."}
- icon_grid: {"layout":"icon_grid", "title":"...", "items":[{"icon":"emoji","title":"...","description":"..."}], "speaker_note":"..."}
- comparison: {"layout":"comparison", "title":"...", "left":{"title":"...","points":[...]}, "right":{"title":"...","points":[...]}, "speaker_note":"..."}
- image_placeholder: {"layout":"image_placeholder", "title":"...", "points":[...], "image_description":"A modern minimalist office with diverse team collaborating around a laptop, soft natural lighting, photorealistic", "speaker_note":"..."}
- thank_you: {"layout":"thank_you", "title":"Thank You!", "subtitle":"...", "contact":"..."}
- table: {"layout":"table", "title":"...", "headers":["..."], "rows":[["...","..."]], "speaker_note":"..."}
- chart: {"layout":"chart", "title":"...", "chart_type":"bar|line|pie", "categories":["..."], "series":[{"name":"...","values":[0]}], "speaker_note":"..."}

Rules: Use 5+ different layouts. 10-16 slides. Start with title, end with thank_you. Include key_metrics, timeline or icon_grid, and a quote. Concise bullets (max 6 per slide, under ~12 words each — long bullets wrap badly in the fixed-height boxes). Add speaker_notes. Use emojis in icon_grid. For chart_type, pick line for trends over time/sequence, bar for comparing discrete categories, and pie only for parts-of-a-whole with 5 or fewer slices. For key_metrics values, include the unit/format inline in the string (e.g. "42%", "$1.2M", "3.5x") rather than a bare number. For image_placeholder's image_description, write a genuinely useful image-generation prompt — a concrete visual subject, style, and composition — not a vague label.

DESIGN QUALITY (this is what separates a good deck from a boring one):
- Pick the theme deliberately for THIS topic's mood, not out of habit — midnight/royal read serious and executive; sunset/coral read energetic and creative; forest/ocean read calm and grounded; clean_light/arctic read minimal and technical. Vary your choice across different requests rather than defaulting to the same 1-2 themes every time.
- Never repeat the same layout on two consecutive slides — alternate deliberately so the deck has visual rhythm, not a wall of identical content slides.
- Write specific, punchy titles tied to the actual content ("Why Q3 Churn Spiked" not "Overview" or "Introduction") — a generic title on every slide is the single most common way decks read as boring.
- Use key_metrics, comparison, or timeline slides to break up runs of plain bullet content — don't let more than two "content" layout slides appear back to back.
- style_suggestions should explain the actual rationale for the theme/structure choice made, not generic tips ("Try: Use a warm sunset theme" tells the user nothing — "Sunset theme picked for the energetic, launch-day tone of this topic" does).

REMEMBER: Output ONLY the JSON code block. No other text. No markdown descriptions. No slide-by-slide explanations. JUST THE JSON.''',
}
