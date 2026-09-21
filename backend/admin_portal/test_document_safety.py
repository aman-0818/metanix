"""Regression coverage for private document processing and duplicate deliveries."""
import os
import shutil
import tempfile
import zipfile
from unittest import skipUnless
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase, override_settings

from accounts.models import User
from .models import EmbeddingChunk, KnowledgeDocument
from .services.embeddings import embedding_identity
from .services.pdf_operations import operate
from .services.rag import ingest, retrieve


@override_settings(EMBEDDING_MODEL='safety-test', EMBEDDING_DIMENSIONS=3)
class KnowledgeIngestionSafetyTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='safety-admin', role='admin')
        self.user = User.objects.create(username='safety-user')
        self.document = KnowledgeDocument.objects.create(owner=self.admin, title='Travel policy',
            file='unused.txt', file_type='txt', allowed_roles=['user'])

    @patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]])
    def test_duplicate_delivery_does_not_start_a_second_ingestion(self, embed_mock):
        def extract(*args):
            # Deliver the same task while the first worker is extracting text.
            ingest(self.document.pk, 1)
            return 'Approved travel reimbursement is 123 USD.'

        with patch('admin_portal.services.rag.extract_text', side_effect=extract) as extract_mock:
            ingest(self.document.pk, 1)
        extract_mock.assert_called_once()
        embed_mock.assert_called_once()
        self.document.refresh_from_db()
        self.assertEqual(self.document.status, 'ready')
        self.assertEqual(self.document.chunk_count, 1)
        self.assertEqual(self.document.chunks.count(), 1)

    @patch('admin_portal.services.rag.extract_text')
    def test_completed_version_is_not_reprocessed(self, extract_mock):
        KnowledgeDocument.objects.filter(pk=self.document.pk).update(status='ready')
        ingest(self.document.pk, 1)
        extract_mock.assert_not_called()
        self.document.refresh_from_db()
        self.assertEqual(self.document.status, 'ready')

    @patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]])
    @patch('admin_portal.services.rag.extract_text', return_value='Travel reimbursement policy')
    def test_failed_version_can_be_retried(self, extract_mock, embed_mock):
        KnowledgeDocument.objects.filter(pk=self.document.pk).update(status='failed', error='Temporary failure')
        ingest(self.document.pk, 1)
        self.document.refresh_from_db()
        self.assertEqual(self.document.status, 'ready')
        self.assertEqual(self.document.error, '')
        self.assertEqual(self.document.chunks.count(), 1)

    @patch('admin_portal.services.rag.embed', return_value=[[1, 0, 0]])
    def test_inaccessible_vectors_with_old_dimensions_do_not_break_retrieval(self, embed_mock):
        KnowledgeDocument.objects.filter(pk=self.document.pk).update(status='ready',
            embedding_model=embedding_identity(), embedding_dimensions=3)
        EmbeddingChunk.objects.create(document=self.document, version=1, chunk_index=0,
            chunk_text='Travel reimbursement is 123 USD.', embedding=[1, 0, 0])
        old = KnowledgeDocument.objects.create(owner=self.admin, title='Restricted old policy',
            file='unused.txt', file_type='txt', status='ready', allowed_roles=[],
            embedding_model='old-configuration', embedding_dimensions=2)
        EmbeddingChunk.objects.create(document=old, version=1, chunk_index=0,
            chunk_text='Restricted reimbursement is 999 USD.', embedding=[1, 0])
        sources, reason = retrieve(self.user, 'Travel reimbursement')
        self.assertEqual(reason, '')
        self.assertEqual([source['document_id'] for source in sources], [self.document.pk])
        self.assertNotIn('999', str(sources))


class PDFProtectionSafetyTests(SimpleTestCase):
    password = 'safety-password'

    def setUp(self):
        import fitz
        self.fitz = fitz
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.protected = os.path.join(self.directory.name, 'protected.pdf')
        with fitz.open() as doc:
            for text in ['Travel policy', 'Approved reimbursement 123 USD']:
                doc.new_page().insert_text((60, 100), text, fontsize=24)
            doc.save(self.protected, encryption=fitz.PDF_ENCRYPT_AES_256,
                     owner_pw=self.password, user_pw=self.password)

    def run_operation(self, operation):
        output = operate([self.protected], operation, {'input_password': self.password}, lambda *args: None)
        self.addCleanup(shutil.rmtree, os.path.dirname(output), True)
        return output

    def assert_protected(self, doc):
        self.assertTrue(doc.needs_pass)
        self.assertFalse(doc.authenticate('incorrect-password'))
        self.assertTrue(doc.authenticate(self.password))

    def test_each_split_page_keeps_the_input_password(self):
        with zipfile.ZipFile(self.run_operation('split')) as archive:
            self.assertEqual(archive.namelist(), ['page-1.pdf', 'page-2.pdf'])
            for name, text in [('page-1.pdf', 'Travel policy'), ('page-2.pdf', '123 USD')]:
                with self.fitz.open(stream=archive.read(name), filetype='pdf') as part:
                    self.assert_protected(part)
                    self.assertEqual(len(part), 1)
                    self.assertIn(text, part[0].get_text())

    @patch('admin_portal.services.pdf_operations.shutil.which', return_value='ocrmypdf')
    @patch('admin_portal.services.pdf_operations.subprocess.run')
    def test_ocr_reencrypts_the_searchable_output(self, run, which):
        def fake_ocr(command, **kwargs):
            with self.fitz.open(command[-2]) as source:
                self.assertFalse(source.needs_pass)
                source.save(command[-1])
            return Mock(returncode=0)
        run.side_effect = fake_ocr
        with self.fitz.open(self.run_operation('ocr')) as result:
            self.assert_protected(result)
            self.assertIn('123 USD', result[1].get_text())
        run.assert_called_once()

    @skipUnless(shutil.which('ocrmypdf'), 'Requires the document worker OCR executable')
    def test_real_ocr_preserves_protection_and_recognizes_scanned_text(self):
        with self.fitz.open() as source:
            page = source.new_page()
            page.insert_text((60, 120), 'Travel policy', fontsize=36)
            page.insert_text((60, 200), 'Approved reimbursement 123 USD', fontsize=24)
            image = page.get_pixmap(dpi=200).tobytes('png')
        with self.fitz.open() as scanned:
            page = scanned.new_page()
            page.insert_image(page.rect, stream=image)
            self.assertEqual(page.get_text().strip(), '')
            scanned.save(self.protected, encryption=self.fitz.PDF_ENCRYPT_AES_256,
                         owner_pw=self.password, user_pw=self.password)
        with self.fitz.open(self.run_operation('ocr')) as result:
            self.assert_protected(result)
            text = ' '.join(page.get_text() for page in result)
            self.assertIn('Travel', text)
            self.assertIn('123', text)
