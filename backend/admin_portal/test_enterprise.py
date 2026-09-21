import io
import json
import os
import shutil
import tempfile
import zipfile
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User, AuditLog
from .models import (LLMProvider, Conversation, Message, KnowledgeDocument, EmbeddingChunk,
                     UserLLMPermission, WebSearchUsage, ConversionJob)
from .conversation_context import build_context, context_limits, relevant_memory
from .services.rag import accessible_documents, chunk_text, ingest, retrieve
from .services.embeddings import embed, EmbeddingUnavailable, embedding_identity
from .services.pdf_operations import operate, page_numbers
from .services.web_chat import native_turn, stream_web_chat, initial_request
from .services.web_search import search


@override_settings(EMBEDDING_MODEL='test-embed', EMBEDDING_DIMENSIONS=3)
class EnterpriseIntegrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.media = override_settings(MEDIA_ROOT=self.directory.name)
        self.media.enable()
        self.addCleanup(self.media.disable)
        self.admin = User.objects.create(username='enterprise-admin', role='admin', is_superuser=True)
        self.user = User.objects.create(username='employee', has_document_converter=True)
        self.other = User.objects.create(username='restricted-employee')
        self.provider = LLMProvider.objects.create(name='test', model_name='test', is_default=True)
        UserLLMPermission.objects.create(user=self.user, llm_provider=self.provider)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def document(self, title='Policy', roles=None, content='Travel reimbursement is 123 USD.', vector=None):
        doc = KnowledgeDocument.objects.create(owner=self.admin, title=title, file='unused.txt',
            file_type='txt', status='ready', allowed_roles=roles or [], embedding_model=embedding_identity(),
            embedding_dimensions=3, chunk_count=1)
        EmbeddingChunk.objects.create(document=doc, version=1, chunk_index=0,
                                      chunk_text=content, embedding=vector or [1, 0, 0])
        return doc

    def test_role_and_explicit_grants_are_enforced_before_retrieval(self):
        public = self.document(roles=['user'])
        restricted = self.document('Secret', content='Private reimbursement is 999 USD.')
        restricted.allowed_users.add(self.other)
        with patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]]):
            sources, _ = retrieve(self.user, 'reimbursement')
            self.assertEqual({s['document_id'] for s in sources}, {public.pk})
            self.assertNotIn('999', str(sources))
            restricted.allowed_users.add(self.user)
            self.assertEqual(set(accessible_documents(self.user).values_list('pk', flat=True)), {public.pk, restricted.pk})
            restricted.allowed_users.remove(self.user)
            self.assertNotIn(restricted.pk, accessible_documents(self.user).values_list('pk', flat=True))

    def test_retrieval_stays_bounded_as_corpus_grows(self):
        doc = self.document(roles=['user'])
        EmbeddingChunk.objects.bulk_create([EmbeddingChunk(document=doc, version=1, chunk_index=i,
            chunk_text='Policy ' * 200, embedding=[1, 0, 0]) for i in range(1, 100)])
        with patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]]):
            sources, _ = retrieve(self.user, 'Policy')
        self.assertLessEqual(len(sources), 6)
        self.assertLessEqual(sum(len(s['text'].encode()) for s in sources), 9000)

    def test_no_relevant_match_returns_explicit_reason(self):
        self.document(roles=['user'], vector=[-1, 0, 0])
        with patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]]):
            sources, reason = retrieve(self.user, 'unrelated')
        self.assertEqual(sources, [])
        self.assertIn('No relevant', reason)

    def test_employees_cannot_upload_manage_or_download_restricted_documents(self):
        doc = self.document()
        self.assertEqual(self.client.get(reverse('knowledge-list')).status_code, 403)
        self.assertEqual(self.client.patch(reverse('knowledge-detail', args=[doc.pk]), {'allowed_roles': ['user']}, format='json').status_code, 403)
        self.assertEqual(self.client.get(reverse('knowledge-detail', args=[doc.pk])).status_code, 404)

    @patch('admin_portal.knowledge_views.ingest_knowledge_task.delay')
    def test_batch_upload_and_replacement_invalidate_old_chunks(self, delay):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse('knowledge-list'), {
                'files': [SimpleUploadedFile('travel.txt', b'Policy A'), SimpleUploadedFile('leave.txt', b'Policy B')],
                'allowed_roles': '["user"]'}, format='multipart')
        self.assertEqual(response.status_code, 202)
        self.assertEqual(delay.call_count, 2)
        doc = KnowledgeDocument.objects.first()
        EmbeddingChunk.objects.create(document=doc, version=1, chunk_index=0, chunk_text='Old', embedding=[1, 0, 0])
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(reverse('knowledge-detail', args=[doc.pk]),
                {'file': SimpleUploadedFile('new.txt', b'New policy')}, format='multipart')
        self.assertEqual(response.status_code, 200)
        doc.refresh_from_db()
        self.assertEqual(doc.version, 2)
        self.assertEqual(doc.status, 'pending')
        self.assertFalse(doc.chunks.exists())

    @patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]])
    def test_ingestion_is_idempotent_and_rejects_stale_version(self, embedding):
        doc = KnowledgeDocument.objects.create(owner=self.admin, title='Policy', file_type='txt',
            file=SimpleUploadedFile('policy.txt', b'Company policy'), allowed_roles=['user'])
        ingest(doc.pk, 1); ingest(doc.pk, 1)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'ready')
        self.assertEqual(doc.chunks.count(), 1)
        KnowledgeDocument.objects.filter(pk=doc.pk).update(version=2, status='pending')
        ingest(doc.pk, 1)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'pending')

    @patch('admin_portal.services.rag.extract_text', return_value='   ')
    def test_scanned_document_has_actionable_status(self, extract):
        doc = self.document()
        KnowledgeDocument.objects.filter(pk=doc.pk).update(status='pending')
        ingest(doc.pk, 1)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'failed')
        self.assertIn('OCR', doc.error)

    def test_regular_and_streaming_chat_receive_only_authorized_evidence(self):
        self.document(roles=['user'])
        self.document('Secret', content='Private secret 999 USD')
        captured = []
        result = {'content': '123 USD [Policy, v1, passage 1]', 'usage': {'total_tokens': 8}, 'latency_ms': 100}
        def regular(fn, provider, messages, **kwargs):
            captured.append(messages)
            return result
        def streaming(provider, messages, **kwargs):
            captured.append(messages)
            yield result['content']
            yield result
        with patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]]), \
             patch('admin_portal.views.llm_request_queue.submit', side_effect=regular), \
             patch('admin_portal.views.stream_llm', side_effect=streaming), \
             patch('admin_portal.views.llm_request_queue.acquire_stream_slot', return_value=True), \
             patch('admin_portal.views.llm_request_queue.release_stream_slot'), \
             patch('admin_portal.views.summarize_conversation_task.delay'), \
             patch('admin_portal.views.chat_stream_post_process_task.delay'):
            for endpoint in ['chat', 'chat-stream']:
                response = self.client.post(reverse(endpoint), {'message': 'Travel reimbursement?', 'chat_mode': 'knowledge'}, format='json')
                self.assertEqual(response.status_code, 200)
                if response.streaming:
                    content = b''.join(response.streaming_content).decode()
                    self.assertIn('event: done', content)
                    self.assertEqual(response['X-Accel-Buffering'], 'no')
                self.assertTrue(Message.objects.filter(role='assistant', content=result['content']).exists())
        self.assertEqual(len(captured), 2)
        for messages in captured:
            self.assertIn('123 USD', str(messages))
            self.assertNotIn('999', str(messages))

    @patch('admin_portal.services.web_search.httpx.post')
    @override_settings(TAVILY_API_KEY='test-key', WEB_SEARCH_DAILY_LIMIT=2, WEB_SEARCH_INTERVAL_SECONDS=60, WEB_SEARCH_DOMAINS=[])
    def test_followup_search_keeps_daily_quota_but_new_reply_is_rate_limited(self, post):
        post.return_value.json.return_value = {'results': []}
        self.assertNotIn('error', search(self.user, 'first query'))
        self.assertIn('rate limit', search(self.user, 'new reply')['error'])
        self.assertNotIn('error', search(self.user, 'same reply followup', followup=True))
        self.assertIn('quota', search(self.user, 'another followup', followup=True)['error'])
        self.assertEqual(post.call_count, 2)

    def test_knowledge_mode_does_not_replay_previously_authorized_answers(self):
        conv = Conversation.objects.create(user=self.user, chat_mode='knowledge')
        Message.objects.create(conversation=conv, role='assistant', content='Revoked secret')
        Message.objects.create(conversation=conv, role='user', content='What is the policy?')
        self.assertNotIn('Revoked', str(build_context(conv, 'Only current evidence', self.provider)))

    def test_daily_provider_quota_is_explained_in_regular_and_streaming_chat(self):
        import httpx
        response = httpx.Response(429, request=httpx.Request('POST', 'https://provider.invalid'), json={
            'error': {'details': [{'violations': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}})
        error = httpx.HTTPStatusError('Rate limited', request=response.request, response=response)
        with patch('admin_portal.views.llm_request_queue.submit', side_effect=error), \
             patch('admin_portal.views.stream_llm', side_effect=error), \
             patch('admin_portal.views.llm_request_queue.acquire_stream_slot', return_value=True), \
             patch('admin_portal.views.llm_request_queue.release_stream_slot'):
            result = self.client.post(reverse('chat'), {'message': 'Hello'}, format='json')
            self.assertEqual(result.status_code, 429)
            self.assertIn('daily API quota', result.data['error'])
            result = self.client.post(reverse('chat-stream'), {'message': 'Hello'}, format='json')
            self.assertEqual(result.status_code, 200)
            stream = b''.join(result.streaming_content).decode()
            self.assertIn('event: error', stream)
            self.assertIn('daily API quota', stream)
            self.assertNotIn('event: done', stream)

    @patch('admin_portal.services.web_search.httpx.post')
    @override_settings(TAVILY_API_KEY='test-key', WEB_SEARCH_DAILY_LIMIT=1, WEB_SEARCH_INTERVAL_SECONDS=0, WEB_SEARCH_DOMAINS=[])
    def test_search_has_separate_quota_and_no_arbitrary_page_fetch(self, post):
        post.return_value.json.return_value = {'results': [{'url': 'https://example.com/report', 'title': 'Report', 'content': 'Fact'},
                                                         {'url': 'javascript:alert(1)', 'title': 'bad'}]}
        result = search(self.user, 'a current public fact')
        self.assertEqual(len(result['sources']), 1)
        self.assertEqual(post.call_args.args[0], 'https://api.tavily.com/search')
        self.assertIn('quota', search(self.user, 'another fact')['error'])
        self.assertEqual(post.call_count, 1)
        self.assertEqual(WebSearchUsage.objects.get(user=self.user).count, 1)
        self.assertNotIn('a current public fact', str(AuditLog.objects.get().new_value))

    @override_settings(MAX_UPLOAD_SIZE_MB=1)
    @patch('admin_portal.converter_views.convert_document_task.delay')
    def test_pdf_endpoint_rejects_spoofed_and_oversized_files_before_queueing(self, delay):
        for data in [b'Not a PDF', b'%PDF-' + b'x' * (1024*1024)]:
            response = self.client.post(reverse('converter-operations'),
                {'operation': 'compress', 'files': [SimpleUploadedFile('test.pdf', data)]}, format='multipart')
            self.assertEqual(response.status_code, 400)
        delay.assert_not_called()


class ContextAndEmbeddingsTests(SimpleTestCase):
    def test_provider_budgets_reserve_system_documents_and_output(self):
        provider = LLMProvider(max_tokens=1000, extra_config={'context_window': 20000,
            'context_token_budget': 15000, 'context_fraction': .5, 'context_max_messages': 40})
        limit, budget = context_limits(provider, 'x' * 9000)
        self.assertEqual(limit, 40)
        self.assertEqual(budget, 10000)
        with self.assertRaises(ValueError): context_limits(provider, 'x' * 60000)

    def test_memory_is_relevant_and_unrelated_facts_stay_out(self):
        user = User(pk=1, long_term_memory='- Developing Python applications\n- Favourite food: mango')
        self.assertIn('Python', relevant_memory(user, 'Help with Python code'))
        self.assertNotIn('mango', relevant_memory(user, 'Help with Python code'))

    def test_multilingual_chunks_are_byte_bounded(self):
        chunks = list(chunk_text('日本語の会社規則 ' * 2000))
        self.assertTrue(chunks)
        self.assertTrue(all(len(chunk.encode('utf-8')) <= 1800 for chunk in chunks))

    @override_settings(EMBEDDING_ENDPOINT='http://localhost:11434/api/embed', EMBEDDING_MODEL='test', EMBEDDING_DIMENSIONS=3)
    @patch('admin_portal.services.embeddings.httpx.post')
    def test_embedding_cache_scope_and_bad_provider_response(self, post):
        cache.clear()
        post.return_value.json.return_value = {'embeddings': [[1, 0, 0]]}
        embed(['question'], scope='user:1'); embed(['question'], scope='user:1')
        self.assertEqual(post.call_count, 1)
        embed(['question'], scope='user:2')
        self.assertEqual(post.call_count, 2)
        post.return_value.json.return_value = {'embeddings': [[1, float('nan'), 0]]}
        with self.assertRaises(EmbeddingUnavailable): embed(['bad'], scope='user:1')


class PDFOperationTests(SimpleTestCase):
    def setUp(self):
        import fitz
        self.fitz = fitz
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = os.path.join(self.directory.name, 'input.pdf')
        with fitz.open() as doc:
            for name in ['Alpha', 'Beta', 'Gamma']:
                doc.new_page().insert_text((72, 72), name)
            doc.save(self.path)

    def run_operation(self, operation, options=None, paths=None):
        output = operate(paths or [self.path], operation, options or {}, lambda *args: None)
        self.addCleanup(shutil.rmtree, os.path.dirname(output), True)
        return output

    def test_merge_and_split_produce_correct_page_counts(self):
        with self.fitz.open(self.run_operation('merge', paths=[self.path, self.path])) as doc:
            self.assertEqual(len(doc), 6)
        with zipfile.ZipFile(self.run_operation('split', {'pages': '1,3'})) as archive:
            self.assertEqual(archive.namelist(), ['page-1.pdf', 'page-3.pdf'])

    def test_rotation_reordering_watermark_and_numbering(self):
        with self.fitz.open(self.run_operation('rotate', {'pages': '2', 'angle': 90})) as doc:
            self.assertEqual([p.rotation for p in doc], [0, 90, 0])
        with self.fitz.open(self.run_operation('reorder', {'pages': '3,1'})) as doc:
            self.assertIn('Gamma', doc[0].get_text())
            self.assertIn('Alpha', doc[1].get_text())
        with self.fitz.open(self.run_operation('watermark', {'text': 'CONFIDENTIAL'})) as doc:
            self.assertIn('CONFIDENTIAL', doc[0].get_text())
        with self.fitz.open(self.run_operation('number_pages')) as doc:
            self.assertIn('3', doc[2].get_text())

    def test_password_round_trip_and_wrong_password_error(self):
        protected = self.run_operation('add_password', {'output_password': 'test-password'})
        with self.fitz.open(protected) as doc:
            self.assertTrue(doc.needs_pass)
        with self.assertRaisesRegex(ValueError, 'correct input password'):
            self.run_operation('remove_password', paths=[protected])
        unprotected = self.run_operation('remove_password', {'input_password': 'test-password'}, [protected])
        with self.fitz.open(unprotected) as doc:
            self.assertFalse(doc.needs_pass)
            self.assertIn('Alpha', doc[0].get_text())

    def test_invalid_page_ranges_are_rejected(self):
        for value in ['0', '4', '2-1', '1,1', '1,2,3,1', 'abc']:
            with self.subTest(value=value), self.assertRaises(ValueError): page_numbers(value, 3)

    @patch('admin_portal.services.pdf_operations.shutil.which', return_value=None)
    def test_ocr_reports_missing_worker_dependency(self, which):
        with self.assertRaisesRegex(ValueError, 'OCR is not installed'):
            self.run_operation('ocr')


class NativeToolTests(SimpleTestCase):
    def mock_http_client(self, events):
        client = Mock()
        client.stream.return_value.__enter__ = Mock(return_value=Mock(iter_lines=lambda: iter(
            'data: ' + json.dumps(event) for event in events)))
        client.stream.return_value.__exit__ = Mock(return_value=False)
        return client

    def test_openai_streams_text_and_assembles_fragmented_tool_arguments(self):
        events = [{'choices': [{'delta': {'content': 'Checking. '}}]},
            {'choices': [{'delta': {'tool_calls': [{'index': 0, 'id': 'call1', 'function': {'name': 'web_search', 'arguments': '{"query":'}}]}}]},
            {'choices': [{'delta': {'tool_calls': [{'index': 0, 'function': {'arguments': '"latest"}'}}]}, 'finish_reason': 'tool_calls'}]},
            {'choices': [], 'usage': {'prompt_tokens': 10, 'completion_tokens': 5}}]
        result = list(native_turn(self.mock_http_client(events), 'https://provider.invalid', {}, {}, 'openai'))
        self.assertEqual(result[0], 'Checking. ')
        self.assertEqual(result[-1]['requests'], [('call1', 'web_search', {'query': 'latest'})])
        self.assertEqual(result[-1]['usage']['prompt_tokens'], 10)

    def test_anthropic_tool_blocks_and_system_contract(self):
        events = [{'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'tool_use', 'id': 'c1', 'name': 'web_search', 'input': {}}},
                  {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'input_json_delta', 'partial_json': '{"query":"news"}'}},
                  {'type': 'message_stop'}]
        result = list(native_turn(self.mock_http_client(events), '', {}, {}, 'anthropic'))[-1]
        self.assertEqual(result['requests'], [('c1', 'web_search', {'query': 'news'})])
        provider = LLMProvider(provider_type='anthropic', model_name='anthropic/test')
        _, _, payload = initial_request(provider, [{'role': 'system', 'content': 'Policy'}, {'role': 'user', 'content': 'Hi'}], 100, .5)
        self.assertEqual(payload['system'][0]['text'], 'Policy')
        self.assertEqual(payload['model'], 'test')

    def test_gemini_retains_thought_signature_on_function_call(self):
        part = {'functionCall': {'name': 'web_search', 'args': {'query': 'news'}}, 'thoughtSignature': 'opaque'}
        events = [{'candidates': [{'content': {'parts': [part]}, 'finishReason': 'STOP'}]}]
        result = list(native_turn(self.mock_http_client(events), '', {}, {}, 'google'))[-1]
        self.assertEqual(result['assistant']['parts'][0]['thoughtSignature'], 'opaque')
        self.assertEqual(result['requests'][0][2], {'query': 'news'})

    def test_truncated_stream_is_not_reported_as_success(self):
        events = [{'choices': [{'delta': {'content': 'Partial'}}]}]
        with self.assertRaisesRegex(ValueError, 'before completion'):
            list(native_turn(self.mock_http_client(events), '', {}, {}, 'openai'))

    @patch('admin_portal.services.web_chat.search')
    @patch('admin_portal.services.web_chat.native_turn')
    def test_timeless_question_needs_only_one_model_call_and_no_search(self, turn, search_mock):
        turn.return_value = iter(['Four.', {'assistant': {}, 'requests': [],
            'usage': {'prompt_tokens': 3, 'completion_tokens': 2, 'cached_tokens': 0}}])
        result = list(stream_web_chat(LLMProvider(provider_type='openai', model_name='test'),
            [{'role': 'user', 'content': '2+2?'}], User(pk=1)))
        self.assertEqual(result[0], 'Four.')
        self.assertEqual(turn.call_count, 1)
        search_mock.assert_not_called()
