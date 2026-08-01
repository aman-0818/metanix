"""
Document text extraction for uploaded files.
Supports PDF, DOCX, TXT, MD, CSV, XLSX.
"""
import csv
import io
import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)


def extract_text(file_path: str, file_type: str) -> str:
    """
    Extract plain text from a file.

    Args:
        file_path: Absolute path to the uploaded file.
        file_type: Extension without dot, e.g. 'pdf', 'docx'.

    Returns:
        Extracted text as a string.

    Raises:
        ValueError: If file type is unsupported.
        Exception: If extraction fails.
    """
    file_type = file_type.lower().strip('.')

    extractor = _EXTRACTORS.get(file_type)
    if extractor is None:
        raise ValueError(f"Unsupported file type: {file_type}")

    return extractor(file_path)


# ---------------------------------------------------------------------------
#  Extractors
# ---------------------------------------------------------------------------

def _extract_txt(file_path: str) -> str:
    """Plain text and markdown files."""
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def _extract_pdf(file_path: str) -> str:
    """PDF extraction using PyPDF2 (or fallback to pdfplumber)."""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(file_path)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return '\n\n'.join(pages)
    except ImportError:
        logger.warning("PyPDF2 not installed, trying pdfplumber")
    except Exception as e:
        logger.warning(f"PyPDF2 failed: {e}, trying pdfplumber")

    try:
        import pdfplumber
        pages = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
        return '\n\n'.join(pages)
    except ImportError:
        raise ImportError(
            "No PDF library available. Install PyPDF2 or pdfplumber: "
            "pip install PyPDF2 pdfplumber"
        )


def _extract_docx(file_path: str) -> str:
    """DOCX extraction using python-docx."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx not installed. Run: pip install python-docx")

    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return '\n\n'.join(paragraphs)


def _extract_csv(file_path: str) -> str:
    """CSV extraction — returns a markdown table representation."""
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        rows = list(reader)

    if not rows:
        return ''

    # Limit to first 500 rows to avoid huge context
    max_rows = 500
    truncated = len(rows) > max_rows
    rows = rows[:max_rows]

    # Build markdown table
    header = rows[0]
    lines = ['| ' + ' | '.join(header) + ' |']
    lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
    for row in rows[1:]:
        # Pad row to match header length
        padded = row + [''] * (len(header) - len(row))
        lines.append('| ' + ' | '.join(padded[:len(header)]) + ' |')

    result = '\n'.join(lines)
    if truncated:
        result += f'\n\n(Showing first {max_rows} of {len(rows)} rows)'
    return result


def _extract_xlsx(file_path: str) -> str:
    """XLSX extraction using openpyxl."""
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise ImportError("openpyxl not installed. Run: pip install openpyxl")

    wb = load_workbook(file_path, read_only=True, data_only=True)
    sheets = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = []
        for row in ws.iter_rows(max_row=500, values_only=True):
            row_data = [str(cell) if cell is not None else '' for cell in row]
            rows.append(row_data)

        if not rows:
            continue

        # Build markdown table per sheet
        header = rows[0]
        lines = [f'## Sheet: {sheet_name}', '']
        lines.append('| ' + ' | '.join(header) + ' |')
        lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
        for row in rows[1:]:
            padded = row + [''] * (len(header) - len(row))
            lines.append('| ' + ' | '.join(padded[:len(header)]) + ' |')
        sheets.append('\n'.join(lines))

    wb.close()
    return '\n\n'.join(sheets)


# ---------------------------------------------------------------------------
#  Validation helpers
# ---------------------------------------------------------------------------

# Magic-byte signatures for a lightweight content-type sniff — defense
# against extension spoofing (e.g. renaming an executable to report.pdf).
# No new dependency: python-magic needs a system libmagic install, which is
# unnecessary weight for checking a handful of well-known signatures.
# txt/md/csv have no reliable magic bytes (plain text) so they're skipped —
# validate_upload() falls back to a "no NUL bytes" binary-content sniff for
# those instead.
_MAGIC_SIGNATURES = {
    'pdf': (b'%PDF-',),
    # DOCX/XLSX are both ZIP-based Office Open XML containers.
    'docx': (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
    'xlsx': (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
}


def _content_matches_type(file, ext: str) -> bool:
    """Best-effort check that the file's actual bytes match its claimed
    extension, independent of the filename."""
    file.seek(0)
    header = file.read(8)
    file.seek(0)

    signatures = _MAGIC_SIGNATURES.get(ext)
    if signatures:
        return any(header.startswith(sig) for sig in signatures)

    # Plain-text types (txt/md/csv): no magic bytes to check — reject
    # anything that looks like binary content instead (NUL byte is never
    # valid in text).
    return b'\x00' not in header


def validate_upload(file) -> tuple:
    """
    Validate an uploaded file against configured limits.

    Args:
        file: Django UploadedFile instance.

    Returns:
        (file_type, error_message) — error_message is None if valid.
    """
    max_size = getattr(settings, 'MAX_UPLOAD_SIZE_MB', 25) * 1024 * 1024
    allowed_types = getattr(settings, 'ALLOWED_UPLOAD_TYPES', ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'])

    # Get extension
    name = file.name or ''
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''

    if not ext:
        return ext, 'File has no extension'

    if ext not in allowed_types:
        return ext, f'File type .{ext} is not allowed. Allowed: {", ".join(allowed_types)}'

    if file.size > max_size:
        return ext, f'File too large ({file.size / (1024*1024):.1f}MB). Maximum: {max_size / (1024*1024):.0f}MB'

    if not _content_matches_type(file, ext):
        return ext, f'File content does not match the .{ext} extension'

    return ext, None


# ---------------------------------------------------------------------------
#  Registry
# ---------------------------------------------------------------------------

_EXTRACTORS = {
    'txt': _extract_txt,
    'md': _extract_txt,
    'pdf': _extract_pdf,
    'docx': _extract_docx,
    'csv': _extract_csv,
    'xlsx': _extract_xlsx,
}
