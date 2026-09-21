from unittest.mock import Mock, patch

from django.test import TestCase, SimpleTestCase, override_settings

from accounts.models import User
from .conversation_context import build_context, is_new_topic, summarize_context
from .llm_engine import get_system_prompt, _call_anthropic, _stream_anthropic
from .models import Conversation, ConversationSummary, LLMProvider, Message


class TopicDetectionTests(SimpleTestCase):
    def test_topic_drift_does_not_discard_history(self):
        self.assertFalse(is_new_topic('Plan a marketing budget', 'Allocate spending across channels.',
                                     'Write a sick leave letter'))

    def test_followups_without_shared_keywords(self):
        for text in ['Make it shorter', 'Continue', 'Yes', 'In Hindi', 'What about Japan?', 'इसे छोटा करो']:
            with self.subTest(text=text):
                self.assertFalse(is_new_topic('Draft an email', 'Dear team,', text))

    def test_explicit_reset_overrides_reference(self):
        self.assertTrue(is_new_topic('Budget', 'Spending', 'Forget that and write a poem'))


@override_settings(CHAT_CONTEXT_MAX_MESSAGES=12, CHAT_CONTEXT_TOKEN_BUDGET=6000,
                   CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ConversationContextTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='context-user', long_term_memory='Old budget project')
        self.provider = LLMProvider.objects.create(name='context-model', model_name='test-model')
        self.conversation = Conversation.objects.create(user=self.user, llm_provider=self.provider)

    def message(self, role, text):
        return Message.objects.create(conversation=self.conversation, role=role, content=text)

    def build(self):
        return build_context(self.conversation, 'System policy', self.provider)

    def exchanges(self, count):
        for index in range(count):
            self.message('user', f'Budget planning category {index}')
            self.message('assistant', f'Budget category {index}: allocate funds.')

    def test_reset_is_persistent_and_omits_old_summary_and_memory(self):
        self.exchanges(1)
        old = self.conversation.messages.last()
        ConversationSummary.objects.create(conversation=self.conversation, summary='Old budget summary',
                                           covered_through=old.created_at)
        self.message('user', 'New topic: Write a sick leave letter')
        result = self.build()
        self.assertEqual([m['role'] for m in result], ['system', 'user'])
        self.assertNotIn('budget', str(result))
        self.message('assistant', 'Dear manager, I am unwell.')
        self.message('user', 'Make it shorter')
        self.assertNotIn('budget', str(self.build()))
        self.assertEqual(len(self.build()), 4)

    def test_window_retains_latest_and_starts_with_user(self):
        self.exchanges(10)
        latest = self.message('user', 'Continue the budget')
        result = self.build()
        self.assertLessEqual(len(result), 15)  # bounded memory note adds one exchange
        self.assertEqual(result[1]['role'], 'user')
        self.assertEqual(result[-1]['content'], latest.content)

    @override_settings(CHAT_CONTEXT_TOKEN_BUDGET=10)
    def test_oversized_latest_input_is_never_silently_truncated(self):
        self.exchanges(1)
        text = 'Continue ' + 'x' * 500
        self.message('user', text)
        self.assertEqual(self.build()[-1]['content'], text)

    def test_legacy_summary_is_not_used_as_a_cutoff(self):
        self.exchanges(1)
        ConversationSummary.objects.create(conversation=self.conversation, summary='Legacy summary')
        self.message('user', 'Continue')
        self.assertEqual(len(self.build()), 4)

    def test_summary_covers_only_evicted_messages_and_keeps_concurrent_input(self):
        self.exchanges(10)
        arrival = []

        def summarize(*args, **kwargs):
            arrival.append(self.message('user', 'Continue with the budget'))
            return {'content': 'Budget decisions so far.'}

        llm = Mock(side_effect=summarize)
        self.assertTrue(summarize_context(self.conversation, self.provider, llm))
        summary = ConversationSummary.objects.get(conversation=self.conversation)
        self.assertLess(summary.covered_through, arrival[0].created_at)
        result = self.build()
        self.assertEqual(result[-1]['content'], arrival[0].content)
        self.assertNotIn(summary.summary, result[0]['content'])
        self.assertIn(summary.summary, result[1]['content'])
        self.assertFalse(summarize_context(self.conversation, self.provider, llm))
        self.assertEqual(llm.call_count, 1)

    def test_summary_result_discarded_if_topic_changes_during_call(self):
        self.exchanges(10)

        def summarize(*args, **kwargs):
            self.message('user', 'New topic: Write a sick leave letter')
            self.build()
            return {'content': 'Stale budget facts'}

        self.assertFalse(summarize_context(self.conversation, self.provider, summarize))
        self.assertFalse(ConversationSummary.objects.filter(conversation=self.conversation).exists())

    def test_failed_summary_leaves_history_available(self):
        self.exchanges(10)
        self.assertFalse(summarize_context(self.conversation, self.provider, Mock(return_value={'content': ''})))
        self.assertEqual(self.conversation.messages.count(), 20)
        self.assertFalse(ConversationSummary.objects.filter(conversation=self.conversation).exists())

    @patch('admin_portal.models.AppConfig.get', return_value='Always add a Reality check section')
    def test_response_policy_applies_to_database_overrides(self, config):
        prompt = get_system_prompt(self.provider)
        self.assertIn('These response rules take precedence', prompt)
        self.assertIn('Do not add boilerplate', prompt)


class AnthropicPayloadTests(SimpleTestCase):
    @patch('admin_portal.llm_engine._http_client.post')
    def test_nonstream_system_is_not_in_user_messages(self, post):
        post.return_value.json.return_value = {'content': [{'type': 'text', 'text': 'Hello'}], 'usage': {}}
        _call_anthropic(provider=Mock(), messages=[{'role': 'system', 'content': 'Policy'},
                        {'role': 'user', 'content': 'Hi'}], api_key='test', model='claude-test',
                        endpoint='', max_tokens=100, temperature=0.5)
        payload = post.call_args.kwargs['json']
        self.assertEqual(payload['system'][0]['text'], 'Policy')
        self.assertEqual(payload['messages'], [{'role': 'user', 'content': 'Hi'}])

    @patch('admin_portal.llm_engine._http_client.stream')
    def test_stream_system_is_not_in_user_messages(self, stream):
        stream.return_value.__enter__.return_value.iter_lines.return_value = iter([])
        list(_stream_anthropic(provider=Mock(), messages=[{'role': 'system', 'content': 'Policy'},
             {'role': 'user', 'content': 'Hi'}], api_key='test', model='claude-test',
             endpoint='', max_tokens=100, temperature=0.5))
        payload = stream.call_args.kwargs['json']
        self.assertEqual(payload['system'][0]['text'], 'Policy')
        self.assertEqual(payload['messages'], [{'role': 'user', 'content': 'Hi'}])
