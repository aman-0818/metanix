from io import StringIO

from django.core.management import call_command
from django.test import TestCase, SimpleTestCase

from accounts.models import User
from .conversation_titles import ensure_title, generate_title
from .models import Conversation, Message


class TitleTextTests(SimpleTestCase):
    def test_question_and_response_heading(self):
        self.assertEqual(generate_title('Can you explain Python memory?', '# Python memory management\nDetails'),
                         'Python memory management')

    def test_unrelated_response_heading_does_not_replace_question(self):
        self.assertEqual(generate_title('Please write a sick leave letter', '# Summary\nDear manager'),
                         'Sick leave letter')

    def test_long_unbroken_text_is_bounded(self):
        self.assertEqual(len(generate_title('x' * 100)), 60)


class StoredTitleTests(TestCase):
    def setUp(self):
        user = User.objects.create(username='title-user')
        self.chat = Conversation.objects.create(user=user)
        Message.objects.create(conversation=self.chat, role='user', content='Explain Python memory')

    def test_stream_title_saved_before_background_response(self):
        self.assertEqual(ensure_title(self.chat, '# Python memory management\nDetails'), 'Python memory management')
        self.chat.refresh_from_db()
        self.assertEqual(self.chat.title, 'Python memory management')

    def test_old_chat_uses_first_exchange_and_backfill_is_repeatable(self):
        Message.objects.create(conversation=self.chat, role='assistant', content='# Python memory management\nDetails')
        Message.objects.create(conversation=self.chat, role='user', content='Now write a letter')
        Message.objects.create(conversation=self.chat, role='assistant', content='Dear manager')
        for _ in range(2):
            call_command('backfill_conversation_titles', stdout=StringIO())
        self.chat.refresh_from_db()
        self.assertEqual(self.chat.title, 'Python memory management')

    def test_concurrent_manual_rename_is_preserved(self):
        Conversation.objects.filter(pk=self.chat.pk).update(title='My custom name')
        self.assertEqual(ensure_title(self.chat), 'My custom name')

    def test_empty_chat_remains_new_chat(self):
        self.chat.messages.all().delete()
        self.assertEqual(ensure_title(self.chat), 'New Chat')
