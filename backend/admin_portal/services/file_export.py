"""
Renders an assistant chat reply into a downloadable Word / PDF / Excel /
PowerPoint / CSV / Markdown file, so a user can ask "give me this as a word
doc" mid-conversation the same way they can ask for a presentation. Mirrors
pptx_generator.py's conventions (media/<kind>/ output dir, uuid-suffixed
filename, path returned relative to MEDIA_ROOT) but works from the LLM's own
freeform markdown-ish reply instead of a structured JSON slide format —
there's no schema to rely on, just a lightweight line-by-line classifier
shared by all six renderers.
"""
import logging
import os
import re
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r'^(#{1,3})\s+(.*)$')
_BULLET_RE = re.compile(r'^[-*]\s+(.*)$')
_NUMBERED_RE = re.compile(r'^\d+\.\s+(.*)$')
_TABLE_ROW_RE = re.compile(r'^\|(.+)\|$')
_TABLE_SEP_RE = re.compile(r'^\|[\s:|-]+\|$')
_BOLD_RE = re.compile(r'\*\*(.+?)\*\*')
_INLINE_CODE_RE = re.compile(r'`([^`]+)`')


def _strip_inline_md(text: str) -> str:
    """Flatten **bold** and `code` markers to plain text — for contexts that
    can't render inline styling (Word headings/table cells, Excel cells).
    Without this the raw ** and ` markers leak into the file verbatim."""
    text = _BOLD_RE.sub(r'\1', text)
    text = _INLINE_CODE_RE.sub(r'\1', text)
    return text


def _safe_filename_stem(title: str) -> str:
    stem = re.sub(r'[^\w\s-]', '', title)[:50].strip().replace(' ', '_')
    return stem or 'document'


def _output_path(kind: str, title: str, ext: str) -> tuple[str, str]:
    """Returns (absolute_filepath, media_relative_path)."""
    from django.conf import settings

    output_dir = os.path.join(settings.MEDIA_ROOT, kind)
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{_safe_filename_stem(title)}_{uuid.uuid4().hex[:8]}.{ext}"
    return os.path.join(output_dir, filename), f"{kind}/{filename}"


def _parse_blocks(content: str):
    """
    Classifies each line of a chat reply into a small set of block types.
    Consecutive table rows group into one ('table', [[cell, ...], ...])
    block; consecutive fenced-code lines group into one ('code', text)
    block (original indentation preserved, unlike every other block type)
    so renderers can give code its own monospace treatment instead of
    silently flattening it to a normal paragraph.
    """
    blocks = []
    table_rows: list[list[str]] = []
    code_lines: list[str] = []
    in_code_fence = False

    def flush_table():
        if table_rows:
            blocks.append(('table', table_rows.copy()))
            table_rows.clear()

    def flush_code():
        if code_lines:
            blocks.append(('code', '\n'.join(code_lines)))
            code_lines.clear()

    for raw_line in content.split('\n'):
        line = raw_line.rstrip()

        if line.strip().startswith('```'):
            if in_code_fence:
                flush_code()
            in_code_fence = not in_code_fence
            continue
        if in_code_fence:
            flush_table()
            code_lines.append(raw_line)
            continue

        if not line.strip():
            flush_table()
            blocks.append(('blank', ''))
            continue

        m = _TABLE_ROW_RE.match(line.strip())
        if m and not _TABLE_SEP_RE.match(line.strip()):
            table_rows.append([c.strip() for c in m.group(1).split('|')])
            continue
        if _TABLE_SEP_RE.match(line.strip()):
            continue  # the |---|---| separator row — not real data
        flush_table()

        m = _HEADING_RE.match(line)
        if m:
            blocks.append((f'heading{len(m.group(1))}', m.group(2).strip()))
            continue
        m = _BULLET_RE.match(line)
        if m:
            blocks.append(('bullet', m.group(1).strip()))
            continue
        m = _NUMBERED_RE.match(line)
        if m:
            blocks.append(('numbered', m.group(1).strip()))
            continue
        blocks.append(('paragraph', line.strip()))

    flush_table()
    flush_code()
    return blocks


def generate_docx(content: str, title: str = 'Response') -> str:
    """Returns the media-relative path (e.g. 'exports/xyz.docx')."""
    from docx import Document as DocxDocument
    from docx.shared import Pt

    doc = DocxDocument()
    doc.add_heading(title, level=0)

    for block_type, value in _parse_blocks(content):
        if block_type == 'blank':
            continue
        elif block_type.startswith('heading'):
            doc.add_heading(_strip_inline_md(value), level=int(block_type[-1]))
        elif block_type == 'bullet':
            _add_docx_runs(doc.add_paragraph(style='List Bullet'), value)
        elif block_type == 'numbered':
            _add_docx_runs(doc.add_paragraph(style='List Number'), value)
        elif block_type == 'table':
            rows = value
            if not rows:
                continue
            table = doc.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = 'Light Grid Accent 1'
            for r, row in enumerate(rows):
                for c, cell in enumerate(row):
                    if c < len(table.columns):
                        table.rows[r].cells[c].text = _strip_inline_md(cell)
        elif block_type == 'code':
            # One paragraph per line (not one paragraph with embedded \n —
            # Word doesn't render those as separate lines) in a monospace
            # font, so code reads as code instead of blending into prose.
            for code_line in value.split('\n'):
                p = doc.add_paragraph()
                run = p.add_run(code_line or ' ')
                run.font.name = 'Courier New'
                run.font.size = Pt(9.5)
                p.paragraph_format.space_after = Pt(0)
        else:
            p = doc.add_paragraph()
            _add_docx_runs(p, value)
            p.paragraph_format.space_after = Pt(6)

    filepath, rel_path = _output_path('exports', title, 'docx')
    doc.save(filepath)
    logger.info("Generated DOCX export: %s", filepath)
    return rel_path


def _add_docx_runs(paragraph, text: str):
    """Splits **bold** spans into bold runs; everything else is plain text
    (with `code` backticks flattened first so they don't render literally)."""
    text = _INLINE_CODE_RE.sub(r'\1', text)
    pos = 0
    for m in _BOLD_RE.finditer(text):
        if m.start() > pos:
            paragraph.add_run(text[pos:m.start()])
        paragraph.add_run(m.group(1)).bold = True
        pos = m.end()
    if pos < len(text):
        paragraph.add_run(text[pos:])


def generate_pdf(content: str, title: str = 'Response') -> str:
    """Returns the media-relative path (e.g. 'exports/xyz.pdf')."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle, ListFlowable, ListItem
    from reportlab.lib import colors

    filepath, rel_path = _output_path('exports', title, 'pdf')
    pdf_doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
    )
    styles = getSampleStyleSheet()
    heading_styles = {
        1: styles['Heading1'], 2: styles['Heading2'], 3: styles['Heading3'],
    }
    story = [Paragraph(_pdf_inline(title), styles['Title']), Spacer(1, 12)]

    bullets: list[str] = []

    def flush_bullets():
        if bullets:
            story.append(ListFlowable(
                [ListItem(Paragraph(_pdf_inline(b), styles['Normal'])) for b in bullets],
                bulletType='bullet',
            ))
            bullets.clear()

    for block_type, value in _parse_blocks(content):
        if block_type == 'blank':
            flush_bullets()
            story.append(Spacer(1, 6))
        elif block_type.startswith('heading'):
            flush_bullets()
            story.append(Paragraph(_pdf_inline(value), heading_styles.get(int(block_type[-1]), styles['Heading3'])))
        elif block_type in ('bullet', 'numbered'):
            bullets.append(value)
        elif block_type == 'table':
            flush_bullets()
            rows = [[Paragraph(_pdf_inline(cell), styles['Normal']) for cell in row] for row in value]
            if rows:
                table = Table(rows)
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E5E7EB')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(table)
                story.append(Spacer(1, 6))
        elif block_type == 'code':
            flush_bullets()
            # Preformatted preserves whitespace/line breaks as-is and uses
            # reportlab's built-in monospace 'Code' style — no markdown
            # bold/inline handling needed (or wanted) inside a code block.
            story.append(Preformatted(_escape_xml(value), styles['Code']))
            story.append(Spacer(1, 6))
        else:
            flush_bullets()
            try:
                story.append(Paragraph(_pdf_inline(value), styles['Normal']))
            except Exception:
                story.append(Paragraph(_pdf_inline(value[:500]), styles['Normal']))

    flush_bullets()
    pdf_doc.build(story or [Paragraph('Empty response', styles['Normal'])])
    logger.info("Generated PDF export: %s", filepath)
    return rel_path


def _escape_xml(text: str) -> str:
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _pdf_inline(text: str) -> str:
    """Prepare text for a reportlab Paragraph: XML-escape first (so literal
    <, &, > in the reply are safe), then turn **bold** into <b> tags and
    flatten `code` backticks. Order matters — escape before adding our tags."""
    t = _escape_xml(text)
    t = _BOLD_RE.sub(r'<b>\1</b>', t)
    t = _INLINE_CODE_RE.sub(r'\1', t)
    return t


def generate_xlsx(content: str, title: str = 'Response') -> str:
    """
    Returns the media-relative path (e.g. 'exports/xyz.xlsx'). Writes any
    markdown table(s) found as real spreadsheet rows; any other text becomes
    one row per non-empty line in a single column, so a request for a
    spreadsheet from a non-tabular reply still produces a usable file rather
    than an empty one.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = 'Sheet1'

    blocks = _parse_blocks(content)
    tables = [rows for (t, rows) in blocks if t == 'table']

    row_idx = 1
    if tables:
        for rows in tables:
            for r, row in enumerate(rows):
                for c, cell in enumerate(row):
                    xcell = ws.cell(row=row_idx, column=c + 1, value=_strip_inline_md(cell))
                    if r == 0:
                        xcell.font = Font(bold=True)
                row_idx += 1
            row_idx += 1  # blank row between multiple tables
    else:
        ws.cell(row=1, column=1, value=title).font = Font(bold=True)
        row_idx = 2
        for block_type, value in blocks:
            if block_type in ('blank',):
                continue
            ws.cell(row=row_idx, column=1, value=_strip_inline_md(value))
            row_idx += 1

    for col in ws.columns:
        width = max((len(str(c.value)) for c in col if c.value), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(60, max(10, width + 2))

    filepath, rel_path = _output_path('exports', title, 'xlsx')
    wb.save(filepath)
    logger.info("Generated XLSX export: %s", filepath)
    return rel_path


def generate_csv(content: str, title: str = 'Response') -> str:
    """
    Returns the media-relative path (e.g. 'exports/xyz.csv'). Writes any
    markdown table(s) found as real CSV rows; with no table, falls back to
    one row per non-empty line (mirroring generate_xlsx's non-tabular
    fallback) so a CSV request on prose still produces a usable file
    instead of an empty one.
    """
    import csv as csv_module

    blocks = _parse_blocks(content)
    tables = [rows for (t, rows) in blocks if t == 'table']

    filepath, rel_path = _output_path('exports', title, 'csv')
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv_module.writer(f)
        if tables:
            for i, rows in enumerate(tables):
                if i > 0:
                    writer.writerow([])
                for row in rows:
                    writer.writerow([_strip_inline_md(c) for c in row])
        else:
            for block_type, value in blocks:
                if block_type in ('blank', 'code'):
                    continue
                writer.writerow([_strip_inline_md(value)])

    logger.info("Generated CSV export: %s", filepath)
    return rel_path


def generate_md(content: str, title: str = 'Response') -> str:
    """
    Returns the media-relative path (e.g. 'exports/xyz.md'). A near-verbatim
    passthrough — the reply is already markdown, so no reparsing is needed,
    just a title heading prepended if it doesn't already start with one.
    """
    filepath, rel_path = _output_path('exports', title, 'md')
    body = content.strip()
    if not body.startswith('#'):
        body = f"# {title}\n\n{body}"
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(body + '\n')
    logger.info("Generated Markdown export: %s", filepath)
    return rel_path


def generate_pptx_from_text(content: str, title: str = 'Response') -> str:
    """
    Returns the media-relative path (e.g. 'presentations/xyz.pptx').
    Converts the reply's headings/bullets/paragraphs into a simple slide
    deck by reusing pptx_generator.generate_pptx — the same renderer
    Presentation mode uses, so decks get its real theming/layouts — but
    fed a plain outline instead of Presentation mode's richer LLM-authored
    JSON (title/subtitle/theme metadata, varied layouts per slide), since
    there's no such structure in an ordinary chat reply. Each top-level
    heading starts a new slide; bullets/paragraphs under it become that
    slide's content.
    """
    from .pptx_generator import generate_pptx

    blocks = _parse_blocks(content)
    slides = [{'layout': 'title', 'title': title}]
    current = None

    for block_type, value in blocks:
        if block_type in ('blank', 'code'):
            continue
        if block_type.startswith('heading'):
            if current and (current.get('points') or current.get('body')):
                slides.append(current)
            current = {'layout': 'content', 'title': _strip_inline_md(value), 'points': []}
            continue
        if current is None:
            current = {'layout': 'content', 'title': title, 'points': []}
        if block_type in ('bullet', 'numbered'):
            current.setdefault('points', []).append(_strip_inline_md(value))
        elif block_type == 'table':
            for row in value:
                current.setdefault('points', []).append(_strip_inline_md(' | '.join(row)))
        else:  # paragraph
            value = _strip_inline_md(value)
            if current.get('points'):
                current['points'].append(value)
            else:
                current['body'] = (current.get('body', '') + ' ' + value).strip()

    if current and (current.get('points') or current.get('body')):
        slides.append(current)
    if len(slides) == 1:
        # Nothing but the title slide got produced (e.g. the reply was only
        # a code block) — add one fallback slide so the deck isn't empty.
        slides.append({'layout': 'content', 'title': title, 'body': content[:800]})

    return generate_pptx(slides, title=title)


_GENERATORS = {
    'docx': generate_docx,
    'pdf': generate_pdf,
    'xlsx': generate_xlsx,
    'pptx': generate_pptx_from_text,
    'csv': generate_csv,
    'md': generate_md,
}


def generate_export(file_type: str, content: str, title: str = 'Response') -> Optional[str]:
    """Dispatches to the right renderer. Returns the media-relative path, or
    raises whatever the underlying library raised (caller is expected to
    catch and record it as export_error)."""
    generator = _GENERATORS.get(file_type)
    if generator is None:
        raise ValueError(f"Unsupported export file_type: {file_type}")
    return generator(content, title)
