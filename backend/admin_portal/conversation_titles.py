"""Local first-exchange titles: no extra model call or background worker required."""
import re

PLACEHOLDERS = ('', 'New Chat', 'New chat')


def generate_title(question, response=''):
    question = question.strip()
    headings = re.findall(r'^\s*#{1,6}\s+(.+?)\s*#*\s*$', response, re.M)
    terms = set(re.findall(r'\w{4,}', question.casefold()))
    heading = next((h for h in headings if terms.intersection(re.findall(r'\w{4,}', h.casefold()))), '')
    # A topical response heading can name the exchange more clearly than the request.
    text = heading or question
    if not text:
        text = response.strip()
    text = re.sub(r'^```\w*\s*', '', text)
    text = re.sub(r'^[#*>\s]+', '', text)
    filler = r"^(?:can you|could you|please|i want you to|i need you to|help me|tell me about|explain|write(?: me)?(?: an?| the)?|create(?: an?)?|generate(?: an?)?|what is|what are)\s+"
    for _ in range(3):
        text = re.sub(filler, '', text, flags=re.I).strip()
    text = re.split(r'[\r\n]|(?<=[.!?])\s', text)[0]
    text = re.sub(r'[`*_]', '', text).strip(' \t.,:;!?"')
    text = re.sub(r'\s+', ' ', text) or question.strip() or 'Conversation'
    if len(text) > 60:
        prefix = text[:59]
        text = (prefix.rsplit(' ', 1)[0] if ' ' in prefix else prefix) + '…'
    return text[0].upper() + text[1:]


def ensure_title(conversation, pending_response=''):
    """Use the first stored exchange, and never overwrite a user's custom title."""
    from .models import Conversation

    if conversation.title not in PLACEHOLDERS:
        return conversation.title
    first = conversation.messages.filter(role='user').order_by('created_at', 'pk').first()
    if not first:
        return conversation.title
    answer = conversation.messages.filter(role='assistant', is_export_ack=False,
                                          created_at__gte=first.created_at).order_by('created_at', 'pk').first()
    response = answer.content if answer else ''
    if not response and conversation.messages.filter(role='user').count() == 1:
        response = pending_response
    title = generate_title(first.content, response)
    changed = Conversation.objects.filter(pk=conversation.pk, title__in=PLACEHOLDERS).update(title=title)
    if changed:
        conversation.title = title
    else:
        conversation.refresh_from_db(fields=['title'])
    return conversation.title
