from django.core.management.base import BaseCommand

from admin_portal.conversation_titles import PLACEHOLDERS, ensure_title
from admin_portal.models import Conversation


class Command(BaseCommand):
    help = 'Name existing untitled conversations using their first question and response.'

    def handle(self, *args, **options):
        count = 0
        for conversation in Conversation.objects.filter(title__in=PLACEHOLDERS).iterator(chunk_size=200):
            if ensure_title(conversation) not in PLACEHOLDERS:
                count += 1
        self.stdout.write(self.style.SUCCESS(f'Named {count} conversations.'))
