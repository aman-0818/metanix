"""Native streaming tool loop shared by regular chat and SSE.

At most two search rounds plus one answer. Ordinary answers stream directly from
the first call; no separate routing-model request is needed.
"""
import copy
import json
import time
from django.conf import settings
from django.utils import timezone
from .web_search import search

TOOL = {'name': 'web_search', 'description': (
    'Search public web sources for current events, changing facts, or explicit source verification. '
    'Use only when live evidence is needed, not for timeless facts or writing tasks. '
    'Never put credentials, personal data, or private company document text in a query. '
    'Returns dated source snippets; cite the returned URLs and distinguish publication from lookup dates.'),
    'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}},
                   'required': ['query'], 'additionalProperties': False}}


def initial_request(provider, messages, max_tokens, temperature):
    kind, model = provider.provider_type, provider.model_name
    key = provider.get_api_key()
    config = provider.extra_config if isinstance(provider.extra_config, dict) else {}
    system = '\n'.join(m['content'] for m in messages if m['role'] == 'system')
    history = [copy.deepcopy(m) for m in messages if m['role'] != 'system']
    if kind == 'anthropic':
        base = (provider.api_endpoint or 'https://api.anthropic.com').rstrip('/')
        url = base if base.endswith('/v1/messages') else base + '/v1/messages'
        headers = {'x-api-key': key or getattr(settings, 'CLAUDE_API_KEY', ''), 'anthropic-version': '2023-06-01'}
        payload = {'model': model.removeprefix('anthropic/'), 'messages': history,
                   'max_tokens': max_tokens, 'temperature': temperature, 'stream': True,
                    'tools': [{'name': TOOL['name'], 'description': TOOL['description'], 'input_schema': TOOL['parameters']}]}
        if system.strip():
            payload['system'] = [{'type': 'text', 'text': system,
                                  'cache_control': {'type': 'ephemeral'}}]
    elif kind == 'google':
        url = ((provider.api_endpoint or 'https://generativelanguage.googleapis.com').rstrip('/') +
               f'/v1beta/models/{model.removeprefix("gemini/")}:streamGenerateContent?alt=sse')
        headers = {'x-goog-api-key': key or settings.GEMINI_API_KEY}
        payload = {'systemInstruction': {'parts': [{'text': system}]},
            'contents': [{'role': 'model' if m['role'] == 'assistant' else 'user',
                          'parts': [{'text': m['content']}]} for m in history],
            'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': temperature},
            'tools': [{'functionDeclarations': [{'name': TOOL['name'], 'description': TOOL['description'],
                                                 'parametersJsonSchema': copy.deepcopy(TOOL['parameters'])}]}]}
    else:
        if kind == 'azure_openai':
            base = (provider.api_endpoint or getattr(settings, 'AZURE_OPENAI_ENDPOINT', '')).rstrip('/')
            if not base:
                raise ValueError('Azure OpenAI requires an endpoint URL.')
            deployment = config.get('deployment') or getattr(settings, 'AZURE_OPENAI_DEPLOYMENT', None) or model
            version = provider.api_version or getattr(settings, 'AZURE_OPENAI_API_VERSION', '2024-06-01')
            url = f'{base}/openai/deployments/{deployment}/chat/completions?api-version={version}'
            headers = {'api-key': key or getattr(settings, 'AZURE_OPENAI_API_KEY', '')}
        else:
            base = (provider.api_endpoint or ('https://api.openai.com/v1' if kind == 'openai' else '')).rstrip('/')
            if not base:
                raise ValueError('Custom providers require an endpoint URL.')
            url = base if base.endswith('/chat/completions') else base + ('/chat/completions' if base.endswith('/v1') else '/v1/chat/completions')
            key = key or (config.get('api_key') if kind == 'custom' else getattr(settings, 'OPENAI_API_KEY', ''))
            headers = {'Authorization': f'Bearer {key}'} if key else {}
        payload = {'model': model, 'messages': copy.deepcopy(messages), 'max_tokens': max_tokens,
                   'temperature': temperature, 'stream': True, 'stream_options': {'include_usage': True},
                   'tools': [{'type': 'function', 'function': TOOL}], 'parallel_tool_calls': False}
    return url, headers, payload


def native_turn(client, url, headers, payload, kind):
    """Buffer a round until its native assistant/tool state is complete."""
    text_parts, blocks, calls, google_parts = [], {}, {}, []
    usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'cached_tokens': 0}
    completed = False
    stop_reason = None
    with client.stream('POST', url, headers=headers, json=payload) as response:
        if response.is_error:
            response.read()  # Preserve quota details before the stream closes.
        response.raise_for_status()
        for line in response.iter_lines():
            if not line.startswith('data:'):
                continue
            raw = line[5:].strip()
            if raw == '[DONE]':
                completed = True
                break
            data = json.loads(raw)
            if data.get('error') or data.get('type') == 'error':
                raise ValueError('Provider stream failed.')
            text = ''
            if kind == 'anthropic':
                event = data.get('type')
                if event == 'message_start':
                    u = data['message'].get('usage', {})
                    usage['prompt_tokens'] = u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0)
                    usage['cached_tokens'] = u.get('cache_read_input_tokens', 0)
                elif event == 'content_block_start':
                    blocks[data['index']] = data['content_block']
                elif event == 'content_block_delta':
                    block = blocks[data['index']]
                    delta = data['delta']
                    if delta['type'] == 'text_delta':
                        text = delta['text']; block['text'] = block.get('text', '') + text
                    elif delta['type'] == 'input_json_delta':
                        block['_json'] = block.get('_json', '') + delta['partial_json']
                    elif delta['type'] == 'thinking_delta':
                        block['thinking'] = block.get('thinking', '') + delta['thinking']
                    elif delta['type'] == 'signature_delta':
                        block['signature'] = block.get('signature', '') + delta['signature']
                elif event == 'message_delta':
                    usage['completion_tokens'] = data.get('usage', {}).get('output_tokens', usage['completion_tokens'])
                    stop_reason = data.get('delta', {}).get('stop_reason') or stop_reason
                elif event == 'message_stop':
                    completed = True
            elif kind == 'google':
                candidate = next(iter(data.get('candidates', [])), {})
                parts = candidate.get('content', {}).get('parts', [])
                google_parts.extend(parts)
                text = ''.join(p.get('text', '') for p in parts if not p.get('thought'))
                stop_reason = candidate.get('finishReason') or stop_reason
                completed = completed or bool(stop_reason)
                if 'usageMetadata' in data:
                    u = data['usageMetadata']
                    usage.update(prompt_tokens=u.get('promptTokenCount', 0),
                                 completion_tokens=u.get('candidatesTokenCount', 0) + u.get('thoughtsTokenCount', 0),
                                 cached_tokens=u.get('cachedContentTokenCount', 0))
            else:
                choice = next(iter(data.get('choices', [])), {})
                delta = choice.get('delta', {})
                text = delta.get('content') or delta.get('refusal') or ''
                stop_reason = choice.get('finish_reason') or stop_reason
                completed = completed or bool(stop_reason)
                for call in delta.get('tool_calls', []):
                    item = calls.setdefault(call['index'], {'id': '', 'type': 'function', 'function': {'name': '', 'arguments': ''}})
                    if call.get('id'): item['id'] = call['id']
                    for key in ('name', 'arguments'):
                        item['function'][key] += call.get('function', {}).get(key, '')
                if data.get('usage'):
                    u = data['usage']
                    usage.update(prompt_tokens=u.get('prompt_tokens', 0), completion_tokens=u.get('completion_tokens', 0),
                                 cached_tokens=(u.get('prompt_tokens_details') or {}).get('cached_tokens', 0) or 0)
            if text:
                text_parts.append(text)
    if not completed:
        raise ValueError('Provider stream ended before completion.')
    if stop_reason in ('length', 'max_tokens', 'MAX_TOKENS', 'model_context_window_exceeded'):
        raise ValueError('Provider reached its token limit before completing the response.')
    if kind == 'google' and stop_reason not in ('STOP', None):
        raise ValueError('Provider could not complete the response.')
    requests = []
    if kind == 'anthropic':
        for block in blocks.values():
            if block['type'] == 'tool_use':
                if '_json' in block: block['input'] = json.loads(block.pop('_json'))
                requests.append((block['id'], block['name'], block['input']))
        assistant = {'role': 'assistant', 'content': list(blocks.values())}
    elif kind == 'google':
        for part in google_parts:
            if 'functionCall' in part:
                call = part['functionCall']
                requests.append((call.get('id'), call['name'], call.get('args', {})))
        assistant = {'role': 'model', 'parts': google_parts}
    else:
        for call in calls.values():
            requests.append((call['id'], call['function']['name'], json.loads(call['function']['arguments'])))
        assistant = {'role': 'assistant', 'content': ''.join(text_parts) or None}
        if calls: assistant['tool_calls'] = list(calls.values())
    if not requests and not ''.join(text_parts).strip():
        raise ValueError('Provider returned no answer or tool call.')
    # Do not expose Gemini/OpenAI/Anthropic narration emitted alongside a tool
    # call. It is provisional and may be wrong before search evidence arrives.
    if not requests:
        for part in text_parts:
            yield part
    if not usage['prompt_tokens'] and not usage['completion_tokens']:
        # Some compatible APIs omit SSE usage. Estimate each completed round,
        # including the tool exchange, so opt-in search cannot become free usage.
        from ..conversation_context import estimate_tokens
        prompt = {key: payload[key] for key in ('messages', 'contents', 'system', 'systemInstruction', 'tools')
                  if key in payload}
        usage.update(prompt_tokens=estimate_tokens(json.dumps(prompt, ensure_ascii=False)),
                     completion_tokens=estimate_tokens(json.dumps(assistant, ensure_ascii=False)),
                     estimated=True)
    yield {'assistant': assistant, 'requests': requests, 'usage': usage}


def stream_web_chat(provider, messages, user, *, max_tokens=None, temperature=None):
    from ..llm_engine import _http_client
    start = time.monotonic()
    url, headers, payload = initial_request(provider, messages, max_tokens or provider.max_tokens,
                                           provider.temperature if temperature is None else temperature)
    kind = provider.provider_type
    history = payload['contents'] if kind == 'google' else payload['messages']
    output, sources = [], []
    usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'cached_tokens': 0}
    search_count = 0
    followup_allowed = False
    first_token_ms = None
    for round_index in range(3):
        if round_index == 2:
            # Preserve tool definitions for the exchanges still in history while
            # disabling further calls using each provider's native control.
            if kind == 'google':
                payload['toolConfig'] = {'functionCallingConfig': {'mode': 'NONE'}}
            else:
                payload['tool_choice'] = {'type': 'none'} if kind == 'anthropic' else 'none'
        state = None
        for item in native_turn(_http_client, url, headers, payload, kind):
            if isinstance(item, str):
                if first_token_ms is None: first_token_ms = int((time.monotonic()-start)*1000)
                output.append(item)
                yield item
            else:
                state = item
        for key in ('prompt_tokens', 'completion_tokens', 'cached_tokens'):
            usage[key] += state['usage'][key]
        if state['usage'].get('estimated'):
            usage['estimated'] = True
        if not state['requests']:
            break
        if round_index == 2 or len(state['requests']) > 4:
            raise ValueError('Provider exceeded the allowed tool-call rounds.')
        history.append(state['assistant'])
        results = []
        for call_id, name, args in state['requests']:
            if name == 'web_search' and search_count < 2 and isinstance(args, dict):
                yield {'event': 'search', 'status': 'searching'}
                result = search(user, args.get('query'), followup=followup_allowed)
                if not result.get('error'):
                    followup_allowed = True
                search_count += 1
                sources.extend({k: v for k, v in s.items() if k != 'text'} for s in result.get('sources', []))
                yield {'event': 'sources', 'sources': sources, 'error': result.get('error')}
            else:
                result = {'error': 'Tool unavailable or search limit reached. Answer from existing evidence.'}
            if kind == 'anthropic':
                results.append({'type': 'tool_result', 'tool_use_id': call_id,
                                'content': json.dumps(result), 'is_error': bool(result.get('error'))})
            elif kind == 'google':
                response = {'name': name, 'response': result}
                if call_id is not None:
                    response['id'] = call_id
                results.append({'functionResponse': response})
            else:
                history.append({'role': 'tool', 'tool_call_id': call_id, 'content': json.dumps(result)})
        if results:
            history.append({'role': 'user', 'parts' if kind == 'google' else 'content': results})
    if sources:
        # Persist source transparency in ordinary message content, including history
        # and exports, without requiring clients to reconstruct tool events.
        links = []
        for source in sources:
            from urllib.parse import quote
            title = source['title'].replace('[', '').replace(']', '').replace('\n', ' ')
            links.append(f"- [{title}]({quote(source['url'], safe=':/?=&%#')})")
        footer = '\n\n**Web sources · searched ' + timezone.now().date().isoformat() + '**\n' + '\n'.join(dict.fromkeys(links))
        output.append(footer)
        yield footer
    usage['total_tokens'] = usage['prompt_tokens'] + usage['completion_tokens']
    yield {'content': ''.join(output), 'usage': usage, 'model': provider.model_name,
           'latency_ms': int((time.monotonic()-start)*1000), 'first_token_ms': first_token_ms,
           'sources': sources, 'web_search_count': search_count}
