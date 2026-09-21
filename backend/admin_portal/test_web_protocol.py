"""Native web-tool regressions. All HTTP and search requests are simulated."""
import copy
import json
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase, override_settings

from accounts.models import User
from .llm_engine import call_llm, stream_llm
from .models import LLMProvider
from .services.web_chat import initial_request, native_turn, stream_web_chat


@override_settings(OPENAI_API_KEY='openai-test-key', GEMINI_API_KEY='gemini-test-key', CLAUDE_API_KEY='claude-test-key')
class WebProtocolTests(SimpleTestCase):
    messages = [{'role': 'system', 'content': 'Use dated sources.'},
                {'role': 'user', 'content': 'What changed this week?'}]

    def provider(self, kind, **kwargs):
        return LLMProvider(provider_type=kind, model_name='test-model',
                           extra_config={'web_search': True}, **kwargs)

    def mock_client(self, rounds):
        requests = []
        pending = iter(rounds)

        def respond(request):
            requests.append(json.loads(request.content))
            lines = ['data: ' + (item if isinstance(item, str) else json.dumps(item))
                     for item in next(pending)]
            return httpx.Response(200, headers={'Content-Type': 'text/event-stream'},
                                  text='\n\n'.join(lines) + '\n\n')

        client = httpx.Client(transport=httpx.MockTransport(respond))
        self.addCleanup(client.close)
        return client, requests

    def events(self, kind, queries=(), text='', prompt_tokens=10):
        if kind == 'anthropic':
            result = [{'type': 'message_start', 'message': {'usage': {'input_tokens': prompt_tokens}}}]
            if text:
                result += [{'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}},
                           {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': text}}]
            for index, query in enumerate(queries, 1):
                result += [{'type': 'content_block_start', 'index': index, 'content_block': {
                    'type': 'tool_use', 'id': f'call{index}', 'name': 'web_search', 'input': {}}},
                    {'type': 'content_block_delta', 'index': index,
                     'delta': {'type': 'input_json_delta', 'partial_json': json.dumps({'query': query})}}]
            return result + [{'type': 'message_delta', 'delta': {'stop_reason': 'tool_use' if queries else 'end_turn'},
                              'usage': {'output_tokens': 5}}, {'type': 'message_stop'}]
        if kind == 'google':
            parts = ([{'text': text}] if text else []) + [
                {'functionCall': {'id': f'call{i}', 'name': 'web_search', 'args': {'query': query}},
                 'thoughtSignature': f'signature{i}'} for i, query in enumerate(queries, 1)]
            return [{'candidates': [{'content': {'role': 'model', 'parts': parts}, 'finishReason': 'STOP'}],
                     'usageMetadata': {'promptTokenCount': prompt_tokens, 'candidatesTokenCount': 5}}]
        delta = {'content': text}
        if queries:
            delta['tool_calls'] = [{'index': i, 'id': f'call{i}', 'function': {
                'name': 'web_search', 'arguments': json.dumps({'query': query})}} for i, query in enumerate(queries, 1)]
        return [{'choices': [{'delta': delta, 'finish_reason': 'tool_calls' if queries else 'stop'}]},
                {'choices': [], 'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': 5}}, '[DONE]']

    @override_settings(AZURE_OPENAI_ENDPOINT='https://tenant.openai.azure.com/',
                       AZURE_OPENAI_DEPLOYMENT='actual-deployment', AZURE_OPENAI_API_VERSION='2024-06-01',
                       AZURE_OPENAI_API_KEY='azure-test-key')
    def test_azure_retains_environment_endpoint_deployment_and_version(self):
        url, headers, _ = initial_request(self.provider('azure_openai'), self.messages, 100, .5)
        self.assertEqual(url, 'https://tenant.openai.azure.com/openai/deployments/actual-deployment/chat/completions?api-version=2024-06-01')
        self.assertEqual(headers['api-key'], 'azure-test-key')

    @override_settings(AZURE_OPENAI_ENDPOINT='https://fallback.invalid', AZURE_OPENAI_DEPLOYMENT='fallback')
    def test_azure_provider_settings_override_environment(self):
        provider = self.provider('azure_openai', api_endpoint='https://configured.invalid/', api_version='configured-version')
        provider.extra_config['deployment'] = 'configured-deployment'
        url, _, _ = initial_request(provider, self.messages, 100, .5)
        self.assertEqual(url, 'https://configured.invalid/openai/deployments/configured-deployment/chat/completions?api-version=configured-version')

    @override_settings(AZURE_OPENAI_ENDPOINT='')
    def test_azure_without_endpoint_fails_before_sending_credentials(self):
        with self.assertRaisesRegex(ValueError, 'endpoint'):
            initial_request(self.provider('azure_openai'), self.messages, 100, .5)

    def test_custom_provider_never_inherits_unrelated_openai_key(self):
        provider = self.provider('custom', api_endpoint='https://custom.invalid/v1')
        _, headers, _ = initial_request(provider, self.messages, 100, .5)
        self.assertNotIn('Authorization', headers)
        provider.extra_config['api_key'] = 'custom-test-key'
        _, headers, _ = initial_request(provider, self.messages, 100, .5)
        self.assertEqual(headers['Authorization'], 'Bearer custom-test-key')

    def test_gemini_uses_json_schema_field_and_anthropic_omits_empty_system(self):
        _, _, payload = initial_request(self.provider('google'), self.messages, 100, .5)
        declaration = payload['tools'][0]['functionDeclarations'][0]
        self.assertNotIn('parameters', declaration)
        self.assertFalse(declaration['parametersJsonSchema']['additionalProperties'])
        _, _, payload = initial_request(self.provider('anthropic'), self.messages[1:], 100, .5)
        self.assertNotIn('system', payload)

    def test_parallel_results_share_one_native_message_and_preserve_gemini_ids(self):
        for kind in ('anthropic', 'google'):
            with self.subTest(kind=kind):
                client, requests = self.mock_client([self.events(kind, ('first query', 'second query')),
                                                self.events(kind, text='The sourced answer.')])
                with patch('admin_portal.llm_engine._http_client', client), \
                     patch('admin_portal.services.web_chat.search', return_value={'sources': []}) as search:
                    result = list(stream_web_chat(self.provider(kind), self.messages, User(pk=1)))[-1]
                self.assertEqual(search.call_count, 2)
                history = requests[1]['contents' if kind == 'google' else 'messages']
                self.assertEqual(len(history), 3)
                parts = history[-1]['parts' if kind == 'google' else 'content']
                self.assertEqual(len(parts), 2)
                if kind == 'google':
                    self.assertEqual([part['functionResponse']['id'] for part in parts], ['call1', 'call2'])
                    self.assertEqual(history[-2]['parts'][0]['thoughtSignature'], 'signature1')
                else:
                    self.assertEqual([part['tool_use_id'] for part in parts], ['call1', 'call2'])
                self.assertEqual(result['usage']['total_tokens'], 30)

    def test_two_search_rounds_keep_protocol_history_and_disable_further_tools(self):
        for kind in ('openai', 'anthropic', 'google'):
            with self.subTest(kind=kind):
                client, requests = self.mock_client([self.events(kind, ('first query',), text='Checking. ', prompt_tokens=10),
                    self.events(kind, ('second query',), prompt_tokens=20),
                    self.events(kind, text='Verified answer.', prompt_tokens=30)])
                with patch('admin_portal.llm_engine._http_client', client), \
                     patch('admin_portal.services.web_chat.search', return_value={'sources': [
                         {'title': 'Report', 'url': 'https://example.com/report', 'text': 'Evidence'}]}) as search:
                    stream = stream_web_chat(self.provider(kind), self.messages, User(pk=1))
                    first_event = next(stream)
                    self.assertEqual(first_event, {'event': 'search', 'status': 'searching'})
                    self.assertEqual(search.call_count, 0)
                    events = list(stream)
                    result = events[-1]
                    text = ''.join(event for event in events if isinstance(event, str))
                    self.assertNotIn('Checking.', text)
                    self.assertIn('Verified answer.', text)
                self.assertEqual(search.call_count, 2)
                self.assertEqual(len(requests), 3)
                self.assertEqual([call.kwargs['followup'] for call in search.call_args_list], [False, True])
                self.assertIn('tools', requests[2])
                if kind == 'google':
                    self.assertEqual(requests[2]['toolConfig']['functionCallingConfig']['mode'], 'NONE')
                else:
                    self.assertEqual(requests[2]['tool_choice'], {'type': 'none'} if kind == 'anthropic' else 'none')
                self.assertEqual(result['usage']['prompt_tokens'], 60)
                self.assertEqual(result['usage']['completion_tokens'], 15)
                self.assertEqual(result['usage']['total_tokens'], 75)
                self.assertEqual(result['content'].count('- [Report]'), 1)

    @override_settings(WEB_SEARCH_ENABLED=True, TAVILY_API_KEY='test-key')
    def test_both_chat_entrypoints_estimate_each_round_when_usage_is_missing(self):
        for streaming in (False, True):
            with self.subTest(streaming=streaming):
                rounds = [self.events('openai', ('query one',)), self.events('openai', text='A complete answer.')]
                rounds = [[event for event in events if not isinstance(event, dict) or 'usage' not in event]
                          for events in rounds]
                client, requests = self.mock_client(rounds)
                with patch('admin_portal.llm_engine._http_client', client), \
                     patch('admin_portal.services.web_chat.search', return_value={'sources': []}):
                    provider = self.provider('custom', api_endpoint='https://custom.invalid')
                    response = (stream_llm if streaming else call_llm)(provider, self.messages, web_user=User(pk=1))
                    result = list(response)[-1] if streaming else response
                self.assertEqual(len(requests), 2)
                self.assertTrue(result['usage']['estimated'])
                self.assertGreater(result['usage']['prompt_tokens'], 0)
                self.assertGreater(result['usage']['completion_tokens'], 0)
                self.assertGreater(result['usage']['total_tokens'], 0)
                self.assertEqual(result['content'], 'A complete answer.')

    def test_usage_omitted_on_one_round_does_not_erase_reported_other_round(self):
        first = self.events('openai', ('query one',), prompt_tokens=123)
        second = [event for event in self.events('openai', text='Complete.')
                  if not isinstance(event, dict) or 'usage' not in event]
        client, _ = self.mock_client([first, second])
        with patch('admin_portal.llm_engine._http_client', client), \
             patch('admin_portal.services.web_chat.search', return_value={'sources': []}):
            result = list(stream_web_chat(self.provider('openai'), self.messages, User(pk=1)))[-1]
        self.assertGreater(result['usage']['prompt_tokens'], 123)
        self.assertGreater(result['usage']['completion_tokens'], 5)
        self.assertTrue(result['usage']['estimated'])

    def test_token_limit_stops_are_not_saved_as_completed_answers(self):
        endings = {
            'openai': [{'choices': [{'delta': {'content': 'Partial'}, 'finish_reason': 'length'}]}, '[DONE]'],
            'google': [{'candidates': [{'content': {'parts': [{'text': 'Partial'}]}, 'finishReason': 'MAX_TOKENS'}]}],
            'anthropic': [{'type': 'message_delta', 'delta': {'stop_reason': 'max_tokens'}}, {'type': 'message_stop'}],
        }
        for kind, events in endings.items():
            with self.subTest(kind=kind):
                client, _ = self.mock_client([events])
                with self.assertRaisesRegex(ValueError, 'token limit'):
                    list(native_turn(client, 'https://provider.invalid', {}, {}, kind))

    def test_empty_or_interrupted_stream_is_not_a_success(self):
        for events in ([{'choices': [{'delta': {'content': 'Partial'}}]}],
                       [{'choices': [{'delta': {}, 'finish_reason': 'stop'}]}, '[DONE]']):
            client, _ = self.mock_client([events])
            with self.assertRaises(ValueError):
                list(native_turn(client, 'https://provider.invalid', {}, {}, 'openai'))

    def test_streamed_quota_error_keeps_details_for_safe_user_message(self):
        from .services.provider_errors import chat_error
        payload = {'error': {'message': 'sensitive provider detail', 'details': [
            {'violations': [{'quotaId': 'RequestsPerDayPerProject', 'quotaValue': '20'}]}]}}
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(429, json=payload))) as client:
            with self.assertRaises(httpx.HTTPStatusError) as caught:
                list(native_turn(client, 'https://provider.invalid', {}, {}, 'google'))
        message, status = chat_error(caught.exception, self.provider('google'))
        self.assertEqual(status, 429)
        self.assertIn('Gemini has reached its daily API quota', message)
        self.assertNotIn('sensitive', message)

    def test_null_cache_details_and_refusal_text_are_supported(self):
        events = [{'choices': [{'delta': {'refusal': 'I cannot help with that.'}, 'finish_reason': 'stop'}]},
                  {'choices': [], 'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'prompt_tokens_details': None}}, '[DONE]']
        client, _ = self.mock_client([events])
        result = list(native_turn(client, 'https://provider.invalid', {}, {}, 'openai'))
        self.assertEqual(result[0], 'I cannot help with that.')
        self.assertEqual(result[-1]['usage']['cached_tokens'], 0)

    def test_anthropic_cache_read_and_write_tokens_count_as_prompt_input(self):
        events = self.events('anthropic', text='Complete.')
        events[0]['message']['usage'].update(cache_read_input_tokens=7, cache_creation_input_tokens=3)
        client, _ = self.mock_client([events])
        result = list(native_turn(client, 'https://provider.invalid', {}, {}, 'anthropic'))[-1]
        self.assertEqual(result['usage']['prompt_tokens'], 20)
        self.assertEqual(result['usage']['cached_tokens'], 7)
