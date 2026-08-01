"""
Celery tasks for admin_portal.

Replaces the bare `threading.Thread(...)` calls that used to run chat
post-processing (summarization + usage logging) and the inline,
request-blocking PPTX/document-conversion/text-extraction calls.

WHY THIS MATTERS (see audit): a bare thread spawned from inside a Django view
runs DB queries but is never touched by `close_old_connections()` — that
signal only fires around the request/response cycle. Under real load those
threads leak Postgres connections until the server hits max_connections.
Celery tasks don't have this problem: each task runs inside a worker process
whose connection lifecycle Django manages normally.

Two queues (see CELERY_TASK_ROUTES in settings.py + docker-compose.yml):
  - "chat_post": light, fast (summarization LLM call + a few DB writes).
  - "documents": heavy (PPTX rendering, OCR, format conversion) — kept
    separate so a backlog of document jobs can never starve chat
    post-processing.

Business logic for summarization/usage-logging is intentionally NOT
duplicated here — it's reused from ChatView's existing (already-tested)
helper methods via a lazy import (avoids a circular import with views.py,
which imports *this* module to enqueue tasks).
"""
import logging
import os

from celery import shared_task

logger = logging.getLogger(__name__)


# ===========================================================================
#  Chat post-processing ("chat_post" queue)
# ===========================================================================

@shared_task(name='admin_portal.tasks.summarize_conversation_task')
def summarize_conversation_task(conversation_id, provider_id):
    """Background half of ChatView.post: auto-summarize if the conversation
    has grown past the token threshold. Wraps ChatView._maybe_summarize."""
    from .models import Conversation, LLMProvider
    from .views import ChatView

    try:
        conversation = Conversation.objects.get(id=conversation_id)
        provider = LLMProvider.objects.get(id=provider_id)
    except (Conversation.DoesNotExist, LLMProvider.DoesNotExist) as e:
        logger.error("summarize_conversation_task: %s (conversation=%s, provider=%s)",
                     e, conversation_id, provider_id)
        return

    ChatView()._maybe_summarize(conversation, provider)
    ChatView()._maybe_update_memory(conversation, provider)


@shared_task(name='admin_portal.tasks.chat_stream_post_process_task')
def chat_stream_post_process_task(conversation_id, provider_id, user_id,
                                   ai_content, final_result, permission_id,
                                   message_text, export_format=None,
                                   export_source_content=None, is_export_ack=False):
    """Background half of ChatStreamView: persist the assistant message,
    record quota usage, log usage, auto-title, and auto-summarize — all the
    work that used to run in an unmanaged thread after the SSE 'done' event.

    export_source_content: when set (a "pure export" that reused the previous
    reply instead of calling the LLM), the file is rendered from THAT text
    while ai_content is just the short acknowledgment shown in the bubble.
    final_result is None in that case, which is also the signal that no LLM
    ran — so title/usage/summarize work is skipped.

    is_export_ack: marks the created Message so a LATER pure export knows to
    skip over it when looking for "the last real reply" to re-render —
    otherwise a second "download link" ask would re-export this ack's own
    placeholder text instead of the original content."""
    from accounts.models import User
    from .models import Conversation, LLMProvider, Message, UserLLMPermission
    from .views import ChatView

    try:
        conversation = Conversation.objects.get(id=conversation_id)
        provider = LLMProvider.objects.get(id=provider_id)
        user = User.objects.get(id=user_id)
    except (Conversation.DoesNotExist, LLMProvider.DoesNotExist, User.DoesNotExist) as e:
        logger.error("chat_stream_post_process_task: %s (conversation=%s, provider=%s, user=%s)",
                     e, conversation_id, provider_id, user_id)
        return

    view = ChatView()
    try:
        ai_msg = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=ai_content,
            llm_provider=provider,
            token_count=view._estimate_tokens(ai_content),
            export_status='processing' if export_format else '',
            export_file_type=export_format or '',
            is_export_ack=is_export_ack,
        )
        # Set the title before export generation (not after) so a brand-new
        # conversation's first export is named "IAM_Process_ab12.docx"
        # instead of the generic "Response_ab12.docx" — title generation is
        # a cheap string operation (no LLM call), so this ordering costs
        # nothing. Only runs when the LLM actually produced this turn; a
        # pure export (final_result is None) reused prior content and the
        # conversation already has whatever title its original turn set.
        if final_result and conversation.title in ('New Chat', '') and conversation.messages.count() <= 2:
            conversation.title = view._generate_title(message_text)
            conversation.save(update_fields=['title'])

        if export_format:
            # Name the file after the conversation when it has a real title —
            # "IAM_Process_Document_ab12.docx" beats "Response_ab12.docx".
            title = conversation.title if conversation.title not in ('New Chat', '') else 'Response'
            _generate_message_export(ai_msg, export_format, export_source_content or ai_content, title)
            # Remembered so a later vague follow-up ("give me that too",
            # "send it again") can reuse this format instead of guessing.
            if conversation.last_export_format != export_format:
                conversation.last_export_format = export_format
                conversation.save(update_fields=['last_export_format'])
        if final_result:
            duration_seconds = (final_result.get('latency_ms', 0) or 0) / 1000.0
            if permission_id:
                try:
                    permission = UserLLMPermission.objects.get(id=permission_id)
                    # 1 second was already reserved at the quota-check gate before
                    # streaming started — true up the remainder here.
                    permission.record_usage(max(0, int(duration_seconds) - 1))
                except UserLLMPermission.DoesNotExist:
                    pass
            view._log_usage(user, provider, final_result)
            view._maybe_summarize(conversation, provider)
            view._maybe_update_memory(conversation, provider)
    except Exception:
        logger.exception("chat_stream_post_process_task failed for conversation %s", conversation_id)


def _generate_message_export(ai_msg, file_type, source_content, title='Response'):
    """Renders source_content into file_type (docx/pdf/xlsx) and writes the
    resulting download URL onto the ai_msg row the client polls for. Runs
    inline on the chat_post queue rather than as its own task — python-docx/
    reportlab/openpyxl text rendering is fast (unlike PPTX, there's no
    image/theme work), so a second queue hop isn't worth the complexity.

    source_content is separate from ai_msg.content so a pure export can render
    the *previous* reply's text while the bubble shows only a short ack."""
    from django.conf import settings as dj_settings
    from .services.file_export import generate_export

    try:
        rel_path = generate_export(file_type, source_content, title=title)
        ai_msg.export_file_url = f"{dj_settings.BACKEND_PUBLIC_URL}{dj_settings.MEDIA_URL}{rel_path}"
        ai_msg.export_status = 'completed'
        ai_msg.export_error = ''
        ai_msg.save(update_fields=['export_file_url', 'export_status', 'export_error'])
    except Exception as e:
        logger.exception("File export (%s) failed for message %s", file_type, ai_msg.id)
        ai_msg.export_status = 'failed'
        ai_msg.export_error = str(e)[:2000]
        ai_msg.save(update_fields=['export_status', 'export_error'])


# ===========================================================================
#  PPTX generation ("documents" queue)
# ===========================================================================

@shared_task(name='admin_portal.tasks.generate_pptx_task')
def generate_pptx_task(message_id, slides, title, theme):
    """Renders the .pptx (python-pptx, can take seconds) and writes the
    result back onto the Message row the client is polling."""
    from django.conf import settings as dj_settings
    from .models import Message
    from .services.pptx_generator import generate_pptx

    try:
        rel_path = generate_pptx(slides, title=title, theme=theme)
        pptx_url = f"{dj_settings.BACKEND_PUBLIC_URL}{dj_settings.MEDIA_URL}{rel_path}"
        Message.objects.filter(id=message_id).update(
            pptx_url=pptx_url,
            pptx_theme=theme or '',
            pptx_status='completed',
            pptx_error='',
        )
        logger.info("Generated PPTX for message %s: %s", message_id, rel_path)
    except Exception as e:
        logger.exception("PPTX generation failed for message %s", message_id)
        Message.objects.filter(id=message_id).update(
            pptx_status='failed',
            pptx_error=str(e)[:2000],
        )


# ===========================================================================
#  Document conversion / text extraction ("documents" queue)
# ===========================================================================

@shared_task(name='admin_portal.tasks.convert_document_task')
def convert_document_task(job_id):
    """Runs the (potentially slow — OCR, PyMuPDF, LibreOffice, etc.)
    document conversion and updates the ConversionJob the client polls."""
    from django.core.files.base import ContentFile
    from django.utils import timezone
    from .models import ConversionJob
    from .services.document_converter import convert_document, cleanup_temp_file

    try:
        job = ConversionJob.objects.get(id=job_id)
    except ConversionJob.DoesNotExist:
        logger.error("convert_document_task: ConversionJob %s not found", job_id)
        return

    job.status = 'processing'
    job.save(update_fields=['status'])

    try:
        input_path = job.input_file.path
        success, output_path, message = convert_document(input_path, job.target_format, job.quality)

        if success and output_path:
            with open(output_path, 'rb') as f:
                output_content = f.read()
            output_filename = f"{os.path.splitext(job.original_filename)[0]}.{job.target_format}"
            job.output_file.save(output_filename, ContentFile(output_content))
            job.output_file_size = len(output_content)
            job.status = 'completed'
            job.completed_at = timezone.now()
            job.save()
            cleanup_temp_file(output_path)
        else:
            job.status = 'failed'
            job.error_message = message
            job.save()
    except Exception as e:
        logger.exception("Document conversion failed for job %s", job_id)
        job.status = 'failed'
        job.error_message = str(e)[:2000]
        job.save()


@shared_task(name='admin_portal.tasks.extract_text_task')
def extract_text_task(document_id):
    """Runs (potentially slow — OCR/PyMuPDF) text extraction and updates the
    Document row the client polls for extraction_status."""
    from .models import Document
    from .document_processor import extract_text

    try:
        doc = Document.objects.get(id=document_id)
    except Document.DoesNotExist:
        logger.error("extract_text_task: Document %s not found", document_id)
        return

    doc.extraction_status = 'processing'
    doc.save(update_fields=['extraction_status'])

    try:
        text = extract_text(doc.file.path, doc.file_type)
        doc.extracted_text = text
        doc.extraction_status = 'completed'
        doc.save(update_fields=['extracted_text', 'extraction_status'])
    except Exception as e:
        logger.exception("Text extraction failed for document %s", document_id)
        doc.extraction_status = 'failed'
        doc.extraction_error = str(e)[:2000]
        doc.save(update_fields=['extraction_status', 'extraction_error'])
