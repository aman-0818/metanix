"""Integration and bounded local performance checks, without provider calls."""
import os
import statistics
import tempfile
import time
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, RequestFactory, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from multimodel.media import serve_public_media
from .conversation_context import build_context, semantic_window
from .models import Conversation, ConversionJob, Document, LLMProvider, Message
from .tasks import convert_document_task
from .views import ChatView


class EnterpriseFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        media = override_settings(MEDIA_ROOT=directory.name)
        media.enable()
        self.addCleanup(media.disable)
        self.user = User.objects.create(username='flow-user', has_document_converter=True)
        self.other = User.objects.create(username='flow-other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @override_settings(CHAT_CONTEXT_MAX_MESSAGES=24, CHAT_CONTEXT_TOKEN_BUDGET=12000)
    def test_ten_turns_and_language_switch_retain_original_constraints(self):
        provider = LLMProvider.objects.create(name='flow-model', model_name='test')
        conv = Conversation.objects.create(user=self.user, llm_provider=provider)
        for index in range(10):
            Message.objects.create(conversation=conv, role='user', content=(
                'Plan the event at Lotus Hall with wheelchair access and a 5000 USD budget.'
                if index == 0 else f'Consider catering option {index}.'))
            Message.objects.create(conversation=conv, role='assistant', content='The plan includes that option.')
        Message.objects.create(conversation=conv, role='user', content='अब बजट और पहुँच की शर्तों के साथ अंतिम योजना बताओ।')
        result = build_context(conv, 'Answer helpfully.', provider)
        self.assertIn('Lotus Hall', str(result))
        self.assertIn('5000 USD', str(result))
        self.assertIn('अब बजट', result[-1]['content'])
        self.assertIsNone(conv.context_started_at)

    @override_settings(CHAT_SEMANTIC_CONTEXT=True)
    def test_semantic_recall_adds_old_relevant_exchange_within_budget(self):
        conv = Conversation.objects.create(user=self.user)
        for index in range(12):
            Message.objects.create(conversation=conv, role='user', content=f'Question {index}')
            Message.objects.create(conversation=conv, role='assistant', content=f'Answer {index}')
        Message.objects.create(conversation=conv, role='user', content='Recall question zero')
        messages = list(conv.messages.order_by('-created_at', '-pk'))
        def vectors(texts, **kwargs):
            return [[1, 0] if text in ('Recall question zero', 'Question 0') else [0, 1] for text in texts]
        with patch('admin_portal.conversation_context.embed', side_effect=vectors):
            result = semantic_window(messages, self.user, limit=8, budget=1000)
        self.assertIn('Question 0', [m.content for m in result])
        self.assertIn('Answer 0', [m.content for m in result])
        self.assertLessEqual(len(result), 8)
        self.assertEqual(result[-1].content, 'Recall question zero')

    def test_cached_document_text_still_checks_owner_and_preserves_tail(self):
        doc = Document.objects.create(user=self.user, file='unused.txt', file_type='txt',
            original_filename='policy.txt', extraction_status='completed',
            extracted_text='START ' + 'filler ' * 30000 + ' UNIQUE END')
        load = ChatView()._get_document_context
        first = load([doc.pk], self.user)
        self.assertIn('START', first)
        self.assertIn('UNIQUE END', first)
        self.assertLess(len(first), 40500)
        with self.assertNumQueries(1):
            self.assertEqual(load([doc.pk], self.user), first)
        self.assertIsNone(load([doc.pk], self.other))
        Document.objects.filter(pk=doc.pk).update(user=self.other)
        self.assertIsNone(load([doc.pk], self.user))

    def test_private_media_normalized_paths_never_reach_static_server(self):
        with patch('multimodel.media.serve') as serve:
            for path in ('knowledge_private/policy.pdf', 'public/../knowledge_private/policy.pdf',
                         '%63onversions/output.pdf', 'public/%2e%2e/conversions/output.pdf',
                         'conversions%5coutput.pdf'):
                self.assertEqual(serve_public_media(RequestFactory().get('/'), path).status_code, 404)
            serve.assert_not_called()

    @patch('django.db.close_old_connections')
    def test_converter_download_closes_stale_db_connections_first(self, close_old_connections_mock):
        pdf_bytes = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'
        job = ConversionJob.objects.create(
            user=self.user,
            original_filename='sample.pdf',
            original_format='pdf',
            target_format='pdf',
            quality='high',
            status='completed',
            input_file=SimpleUploadedFile('sample.pdf', b'not-a-real-pdf', content_type='application/pdf'),
            output_file=SimpleUploadedFile('sample.pdf', pdf_bytes, content_type='application/pdf'),
            file_size=len(b'not-a-real-pdf'),
            output_file_size=len(pdf_bytes),
        )

        response = self.client.get(reverse('converter-download', args=[job.pk]))

        self.assertEqual(response.status_code, 200)
        close_old_connections_mock.assert_called_once()

    @patch('admin_portal.converter_views.convert_document_task.delay')
    def test_merge_upload_worker_download_and_delete(self, delay):
        import fitz
        def upload(name, text):
            with fitz.open() as pdf:
                pdf.new_page().insert_text((50, 80), text)
                return SimpleUploadedFile(name, pdf.tobytes(), 'application/pdf')
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse('converter-operations'), {'operation': 'merge',
                'files': [upload('one.pdf', 'FIRST PAGE'), upload('two.pdf', 'SECOND PAGE')]}, format='multipart')
        self.assertEqual(response.status_code, 202, response.data)
        job = ConversionJob.objects.get(pk=response.data['jobs'][0]['id'])
        delay.assert_called_once_with(job.pk)
        self.assertEqual(self.client.delete(reverse('converter-delete', args=[job.pk])).status_code, 409)
        convert_document_task(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, 'completed', job.error_message)
        with patch('admin_portal.services.pdf_operations.operate') as operate:
            convert_document_task(job.pk)
            operate.assert_not_called()
        status = self.client.get(reverse('converter-status', args=[job.pk]))
        self.assertEqual(status.data['progress'], 100)
        download = self.client.get(reverse('converter-download', args=[job.pk]))
        with fitz.open(stream=b''.join(download.streaming_content), filetype='pdf') as pdf:
            self.assertEqual(len(pdf), 2)
            self.assertIn('FIRST PAGE', pdf[0].get_text())
            self.assertIn('SECOND PAGE', pdf[1].get_text())
        self.assertTrue(download.closed)  # The test client closes exhausted streams.
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse('converter-download', args=[job.pk])).status_code, 404)
        self.client.force_authenticate(self.user)
        paths = [job.input_file.path, job.output_file.path] + [item.file.path for item in job.additional_inputs.all()]
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(reverse('converter-delete', args=[job.pk])).status_code, 200)
        self.assertTrue(all(not os.path.exists(path) for path in paths))

    def test_document_assembly_local_benchmark(self):
        # Diagnostic timings only: no flaky speed assertion or live provider calls.
        docs = [Document.objects.create(user=self.user, file='unused.txt', file_type='txt',
                original_filename=f'policy-{i}.txt', extraction_status='completed',
                extracted_text='Policy details ' * 14000) for i in range(5)]
        ids = [doc.pk for doc in docs]
        def baseline():
            text = '\n\n---\n\n'.join(f'Source: {d.original_filename}\n{d.extracted_text}'
                for d in Document.objects.filter(pk__in=ids, user=self.user, extraction_status='completed'))
            return text[:24000] + text[-16000:] if len(text) > 40000 else text
        load = ChatView()._get_document_context
        samples = {'baseline': [], 'cold': [], 'warm': []}
        for _ in range(15):
            for label, function in [('baseline', baseline), ('cold', lambda: load(ids, self.user)),
                                    ('warm', lambda: load(ids, self.user))]:
                if label == 'cold': cache.clear()
                start = time.perf_counter()
                self.assertTrue(function())
                samples[label].append((time.perf_counter() - start) * 1000)
        print('\nDocument assembly medians (ms; 5 x 210 KB; 15 runs): ' +
              ', '.join(f'{key}={statistics.median(values):.3f}' for key, values in samples.items()))
