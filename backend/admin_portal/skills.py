"""
Automatic intent detection for the "General" chat mode.

Metanix's chat modes (general/code/summarize/document/presentation) each carry their own
system prompt in llm_engine._DEFAULT_PROMPTS, tuned for that kind of task. Most users
never bother switching modes for a one-off coding or research question typed while in
General — this module gives General mode a conservative way to notice that and borrow
the more specialized prompt for that single turn, without changing the conversation's
stored chat_mode or the UI's mode selector.

Deliberately excludes 'presentation': its system prompt forces a rigid JSON-only
response format, and a false-positive trigger there would visibly break an ordinary
chat reply. Presentation stays an explicit, user-selected mode only.
"""
import re
from typing import Optional

# Order matters: checked top to bottom, first match wins. Code and document signals
# are narrow/specific; research signals are the broadest, so they're checked last to
# avoid swallowing a code or document request that happens to also say "analyze".

_CODE_PATTERNS = [
    r'```',  # the user pasted a code block
    r'\b(write|fix|debug|refactor|optimi[sz]e|review)\b.{0,40}\b(code|function|script|class|method|bug|regex|query|component|endpoint|snippet)\b',
    r'\b(stack ?trace|traceback|exception|null ?pointer|segfault|syntax error|typeerror|undefined is not a function)\b',
    r'\b(def |function\s+\w+\s*\(|class\s+\w+\s*[:\(]|import\s+\w+|console\.log|SELECT\s+.+\s+FROM)\b',
    r'\bhow (do|would|can) i (write|implement|build|fix|debug)\b',
]

_DOCUMENT_PATTERNS = [
    r'\b(in|from|per|according to) (the|this|that) (attached |uploaded |shared )?(document|file|pdf|doc|spreadsheet|report)\b',
    r'\bwhat does (the|this) (attached |uploaded |shared )?(document|file|pdf|report) say\b',
]

_RESEARCH_PATTERNS = [
    r'\b(research|analy[sz]e|analysis|compare|comparison|pros and cons|trade-?offs?|implications?|deep dive|in-depth|literature review|market analysis|competitive landscape)\b',
    r'\b\w+ vs\.? \w+\b',
    r'\b(summari[sz]e|summary|tl;?dr)\b',
]

_CODE_RE = [re.compile(p, re.IGNORECASE) for p in _CODE_PATTERNS]
_DOCUMENT_RE = [re.compile(p, re.IGNORECASE) for p in _DOCUMENT_PATTERNS]
_RESEARCH_RE = [re.compile(p, re.IGNORECASE) for p in _RESEARCH_PATTERNS]

# Detects "turn this into a file" requests so ChatStreamView can render a
# reply into a downloadable file, independent of chat_mode.
#
# The hard part is telling "give me this as a pdf" (an export request) from
# "what does this pdf say" / "in 500 words" (NOT export requests). Six
# narrow triggers, each of which only fires on genuine output intent:
#   1. an explicit file extension  (".docx", ".pdf", ".xlsx", ".pptx", ".csv", ".md")
#   2. an output preposition immediately before the format word
#      ("as a pdf", "in document file", "into an excel spreadsheet") — the
#      preposition is what distinguishes wanting output in that format from
#      merely mentioning it ("understand this pdf" has no such preposition)
#   3. a give/produce verb near the format word ("export … pdf",
#      "give me word file", "convert … to word document"). Deliberately
#      excludes want/need/write — "i want to understand this pdf" and
#      "write 500 words about pdf security" must not fire; wanting output
#      in a format is already covered by the preposition trigger.
#   4. a creation verb ("create"/"make"/"generate"/…) followed by a format
#      word ANYWHERE in the same sentence, handled in Python — see
#      _creation_intent_format's docstring for why this can't be one regex
#      per format the way triggers 1-3 are.
#   5. a bare "download link/file" ask, or a vague "give me that too"/"send
#      it again"/"same format" follow-up — neither names a format, so both
#      resolve to the sentinel 'unspecified': the caller (ChatStreamView)
#      substitutes the conversation's last-used export format if one
#      exists, falling back to docx only when there's no history to reuse.
# Bare "word"/"document" are deliberately NOT format keywords — otherwise
# "in 500 words" and "summarize this document" would false-positive. pptx
# deliberately does NOT include bare "presentation" as a trigger word — that
# overlaps with the existing, separate Presentation chat_mode and is often
# used loosely ("prepare a presentation of the findings" as a written
# report); only unambiguous slide-deck words count here.
_EXPORT_FORMATS = [
    ('pdf',  r'pdf'),
    ('pptx', r'(?:power\s*point|ppt|pptx|slide\s*deck|slides)'),
    ('xlsx', r'(?:excel(?:\s+spreadsheet)?|spreadsheet|xlsx|xls\s+file)'),
    ('csv',  r'(?:csv|comma[\s-]separated)'),
    ('docx', r'(?:word\s+doc(?:ument)?|docx(?:\s+file)?|word\s+file|document\s+file|word\s+format)'),
    ('md',   r'(?:markdown|md\s+file)'),
]
_EXPORT_VERB = r'\b(?:export|download|save|convert|render|give|send|resend|share|provide|attach|prepare)\b'
_OUT_PREP = r'\b(?:as|in|into|to)\s+(?:an?\s+|the\s+)?'

_EXPORT_EXT_RE = {ft: re.compile(r'\.' + ft + r'\b', re.IGNORECASE) for ft, _ in _EXPORT_FORMATS}
_EXPORT_PREP_RE = [(ft, re.compile(_OUT_PREP + fmt + r'\b', re.IGNORECASE)) for ft, fmt in _EXPORT_FORMATS]
_EXPORT_VERB_RE = [(ft, re.compile(_EXPORT_VERB + r'.{0,40}\b' + fmt + r'\b', re.IGNORECASE)) for ft, fmt in _EXPORT_FORMATS]

_CREATION_VERB_RE = re.compile(r'\b(?:create|make|prepare|draft|generate|build)\b', re.IGNORECASE)
# A referential mention ("this pdf", "the attached document", "from this
# report") means the format word names an EXISTING file the user is
# discussing or asking about — not a new one they want produced. A
# conceptual/definitional lead-in ("what a pdf is", "explanation of what
# excel does") means the format word is the TOPIC of a normal chat answer,
# not the output format — "create a short explanation of what a pdf file
# format is used for" wants an explanation in the reply, not a .pdf. Both
# checked against the text *between* the creation verb and the format
# word: "make a summary of the attached document" has "attached" in that
# gap; "create a word document on IAM process" has neither and still
# matches as a real export request.
_REFERENTIAL_RE = re.compile(
    r'\b(?:this|that|these|those|attached|uploaded|shared|'
    r'what|explanation|definition|meaning|explain)\b',
    re.IGNORECASE,
)
_CREATION_MAX_GAP = 45  # chars allowed between the verb and the format word

_BARE_DOWNLOAD_RE = re.compile(r'\bdownload(?:able)?\s+(?:link|url|file)\b', re.IGNORECASE)
# "give me that too", "send it again", "same format" — a follow-up that
# clearly wants export output but never names a format. Requires a
# demonstrative ("this"/"that"/"it") near the verb so this doesn't fire on
# every unrelated "again"/"too" in ordinary conversation ("explain that
# again" still slips through if the conversation has no export history —
# see UNSPECIFIED_FORMAT's resolution in views.py, which only substitutes a
# format when one is actually on record).
_VAGUE_REEXPORT_RE = re.compile(
    r'\b(?:same|similar)\s+format\b|\blike\s+(?:before|last\s+time)\b|'
    r'\b(?:export|give|send|download|share|provide)\b.{0,15}\b(?:this|that|it)\b.{0,15}\b(?:again|too|as well|also)\b',
    re.IGNORECASE,
)

# Sentinel returned by detect_export_format when the user clearly wants a
# file but named no format — the caller resolves this against
# conversation.last_export_format (falling back to 'docx').
UNSPECIFIED_FORMAT = 'unspecified'


_CREATION_FORMAT_PATTERNS = (
    ('pdf',  re.compile(r'\bpdf\b', re.IGNORECASE)),
    ('pptx', re.compile(r'\b(?:power\s*point|pptx|slide\s*deck|slides)\b', re.IGNORECASE)),
    ('xlsx', re.compile(r'\b(?:excel|spreadsheet|xlsx|xls)\b', re.IGNORECASE)),
    ('csv',  re.compile(r'\b(?:csv|comma[\s-]separated)\b', re.IGNORECASE)),
    ('md',   re.compile(r'\bmarkdown\b', re.IGNORECASE)),
    ('docx', re.compile(r'\bdocuments?\b', re.IGNORECASE)),  # most generic — checked last
)


def _creation_intent_format(message: str) -> Optional[str]:
    """
    Handles "create/make/generate + [format]" phrasing that triggers 1-3
    above miss — there's no output preposition ("as/in/into/to") and no
    give/export-style verb, just a bare creation verb: "create a word
    document on IAM process", "create an excel document", "make a pdf
    report". A regex like trigger 3's, requiring the format word to sit
    within N chars of the verb, still has to run in Python because which
    format word counts (pdf vs excel vs bare "document" as a docx signal)
    needs priority ordering — otherwise "create an EXCEL document" matches
    the generic word "document" and returns docx, silently discarding that
    excel was explicitly requested. This is the exact bug this function
    exists to fix: check pdf and excel/xlsx FIRST, and only fall back to
    treating bare "document" as a docx request if neither is present.

    Returns None for a format word that only appears referentially —
    "create a summary of THIS document" — since that's a request to
    analyze an existing file, not produce a new one. Only the text BETWEEN
    the verb and the matched format word is checked for that, not the
    whole tail: "make an excel document FOR THIS" has "this" sitting after
    "document", referring to something else entirely, and must still match.
    """
    verb_m = _CREATION_VERB_RE.search(message)
    if not verb_m:
        return None
    tail = message[verb_m.end():verb_m.end() + _CREATION_MAX_GAP]
    for file_type, fmt_re in _CREATION_FORMAT_PATTERNS:
        fmt_m = fmt_re.search(tail)
        if fmt_m and not _REFERENTIAL_RE.search(tail[:fmt_m.start()]):
            return file_type
    return None


def detect_export_format(message: str) -> Optional[str]:
    """
    Detect a request to render a reply as a downloadable file, e.g.
    "give me this as a word doc", "export this as a pdf", "give me word
    file", "create an excel document", "i need download link", "give me
    that too". Returns 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'csv' | 'md' |
    UNSPECIFIED_FORMAT | None. Checked on every message regardless of
    chat_mode. UNSPECIFIED_FORMAT means "yes, export something" without
    saying what format — the caller resolves it using conversation history.
    """
    if not message:
        return None
    for ft, _ in _EXPORT_FORMATS:
        if _EXPORT_EXT_RE[ft].search(message):
            return ft
    for ft, rgx in _EXPORT_PREP_RE:
        if rgx.search(message):
            return ft
    for ft, rgx in _EXPORT_VERB_RE:
        if rgx.search(message):
            return ft
    creation_format = _creation_intent_format(message)
    if creation_format:
        return creation_format
    if _BARE_DOWNLOAD_RE.search(message) or _VAGUE_REEXPORT_RE.search(message):
        return UNSPECIFIED_FORMAT
    return None


# Words that are pure "wrapping" around a bare export request — request
# politeness, back-references to the previous reply, and the format nouns
# themselves. If NOTHING but these remains after stripping, the message is
# just "turn my last reply into a file" with no new content to generate, so
# the LLM can be skipped entirely and the previous reply reused (this is the
# whole point — regenerating identical content wastes the user's tokens).
_PURE_EXPORT_STRIP_RE = re.compile(
    r'\b(?:can|could|would|will|you|please|pls|kindly|now|just|also|then|ok|okay|'
    r'i|we|want|wanted|need|needed|like|d|give|get|make|create|generate|convert|turn|put|'
    r'export|download|save|render|prepare|provide|change|send|share|attach|'
    r'again|once|more|retry|resend|repeat|re|instead|same|similar|before|time|last|too|'
    r'as|an?|the|this|that|these|those|it|them|into|in|to|of|from|for|me|us|my|your|'
    r'version|form|format|copy|file|files|link|links|url|doc|docs|document|documents|docx|'
    r'word|pdf|excel|spreadsheet|xlsx|xls|sheet|report|'
    r'power|point|powerpoint|ppt|pptx|slide|slides|deck|csv|comma|separated|markdown|md)\b',
    re.IGNORECASE,
)


def is_pure_export_request(message: str, export_format: Optional[str]) -> bool:
    """
    True when the message only asks to convert the *previous* reply into a
    file (e.g. "i want this in document file", "give me that as a pdf") with
    no new content to generate — so ChatStreamView can reuse the last
    assistant message and skip the LLM call. False for combined requests like
    "write a haiku then export it as a pdf", where real content words survive
    the strip.
    """
    if not export_format:
        return False
    leftover = _PURE_EXPORT_STRIP_RE.sub(' ', message.lower())
    leftover = re.sub(r'[^\w\s]', ' ', leftover)
    return len([w for w in leftover.split() if w]) == 0


def detect_intent(message: str) -> Optional[str]:
    """
    Conservatively classify a General-mode message as 'code', 'document', or
    'summarize' (Research) if it strongly matches that task type, else None.

    Only called when chat_mode == 'general' — the result is used to pick a richer
    system prompt for this one turn without switching the conversation's stored mode.
    """
    if not message:
        return None

    for pattern in _CODE_RE:
        if pattern.search(message):
            return 'code'

    for pattern in _DOCUMENT_RE:
        if pattern.search(message):
            return 'document'

    for pattern in _RESEARCH_RE:
        if pattern.search(message):
            return 'summarize'

    return None
