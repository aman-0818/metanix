"""
Enterprise Document Converter Service
=====================================
Professional-grade document conversion with OCR support.
Uses pure Python libraries - no external dependencies like LibreOffice required.

Supported conversions:
- PDF <-> DOCX, TXT, Images, HTML
- DOCX <-> PDF, TXT, HTML
- Excel <-> CSV
- Images <-> PDF, other image formats
- Markdown <-> HTML
- OCR for scanned PDFs
"""
import io
import logging
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Tuple, List

from django.conf import settings

logger = logging.getLogger(__name__)

# Hard cap on pages processed per PDF text-extraction/OCR job. Celery already
# keeps a single slow job off the request-handling threads and off a hard
# CELERY_TASK_TIME_LIMIT, but with no page cap a single huge/adversarial PDF
# could still occupy a "documents" worker slot for a very long time. This is
# a pragmatic ceiling, not a precise page-per-second budget.
MAX_OCR_PAGES = getattr(settings, 'MAX_OCR_PAGES', 50)

# ---------------------------------------------------------------------------
# Supported format mappings
# ---------------------------------------------------------------------------

INPUT_FORMATS = {
    # Documents
    'pdf': 'PDF Document',
    'docx': 'Microsoft Word',
    'doc': 'Microsoft Word (Legacy)',
    'odt': 'OpenDocument Text',
    'rtf': 'Rich Text Format',
    'txt': 'Plain Text',
    'html': 'HTML Document',
    'htm': 'HTML Document',
    'md': 'Markdown',
    # Spreadsheets
    'xlsx': 'Microsoft Excel',
    'xls': 'Microsoft Excel (Legacy)',
    'ods': 'OpenDocument Spreadsheet',
    'csv': 'CSV File',
    # Presentations
    'pptx': 'Microsoft PowerPoint',
    'ppt': 'Microsoft PowerPoint (Legacy)',
    'odp': 'OpenDocument Presentation',
    # Images
    'png': 'PNG Image',
    'jpg': 'JPEG Image',
    'jpeg': 'JPEG Image',
    'gif': 'GIF Image',
    'bmp': 'Bitmap Image',
    'tiff': 'TIFF Image',
    'tif': 'TIFF Image',
    'webp': 'WebP Image',
    'svg': 'SVG Image',
}

OUTPUT_FORMATS = {
    'documents': {
        'pdf': 'PDF Document',
        'docx': 'Microsoft Word',
        'txt': 'Plain Text',
        'html': 'HTML Document',
        'md': 'Markdown',
    },
    'spreadsheets': {
        'xlsx': 'Microsoft Excel',
        'csv': 'CSV File',
        'pdf': 'PDF Document',
    },
    'presentations': {
        'pdf': 'PDF Document',
        'png': 'PNG Images (per slide)',
        'jpg': 'JPEG Images (per slide)',
    },
    'images': {
        'png': 'PNG Image',
        'jpg': 'JPEG Image',
        'webp': 'WebP Image',
        'gif': 'GIF Image',
        'bmp': 'Bitmap Image',
        'pdf': 'PDF Document',
        'tiff': 'TIFF Image',
    },
}

QUALITY_PRESETS = {
    'low': {
        'description': 'Smaller file size, reduced quality',
        'dpi': 72,
        'image_quality': 50,
    },
    'medium': {
        'description': 'Balanced quality and size',
        'dpi': 150,
        'image_quality': 75,
    },
    'high': {
        'description': 'High quality, larger file size',
        'dpi': 300,
        'image_quality': 90,
    },
    'maximum': {
        'description': 'Maximum quality, largest file size',
        'dpi': 600,
        'image_quality': 100,
    },
}


def get_file_category(extension: str) -> str:
    """Determine the category of a file based on extension."""
    ext = extension.lower().lstrip('.')
    if ext in ('pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'htm', 'md'):
        return 'documents'
    elif ext in ('xlsx', 'xls', 'ods', 'csv'):
        return 'spreadsheets'
    elif ext in ('pptx', 'ppt', 'odp'):
        return 'presentations'
    elif ext in ('png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'svg'):
        return 'images'
    return 'unknown'


def get_available_outputs(input_extension: str) -> dict:
    """Get available output formats for a given input format."""
    category = get_file_category(input_extension)
    if category in OUTPUT_FORMATS:
        return OUTPUT_FORMATS[category]
    return {}


# ---------------------------------------------------------------------------
# PDF Conversions using PyMuPDF (fitz)
# ---------------------------------------------------------------------------

def convert_pdf_to_docx(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert PDF to DOCX using pdf2docx with fallback to PyMuPDF + python-docx."""
    input_basename = Path(input_path).stem
    output_path = os.path.join(output_dir, f"{input_basename}.docx")
    
    # First try pdf2docx (better quality for text-based PDFs)
    try:
        from pdf2docx import Converter
        
        cv = Converter(input_path)
        cv.convert(output_path)
        cv.close()
        
        if os.path.exists(output_path):
            return True, output_path, "PDF to DOCX conversion successful"
            
    except Exception as e:
        error_msg = str(e).lower()
        logger.warning(f"pdf2docx failed, trying fallback: {e}")
        
        # If it's a colorspace or image issue, try fallback
        if 'colorspace' in error_msg or 'png' in error_msg or 'image' in error_msg:
            return _convert_pdf_to_docx_fallback(input_path, output_path)
        
        # For other errors, also try fallback
        result = _convert_pdf_to_docx_fallback(input_path, output_path)
        if result[0]:
            return result
        
        return False, None, f"PDF to DOCX conversion failed: {str(e)}"
    
    return False, None, "Output file was not created"


def _convert_pdf_to_docx_fallback(input_path: str, output_path: str) -> Tuple[bool, Optional[str], str]:
    """Fallback PDF to DOCX conversion using PyMuPDF + python-docx."""
    try:
        import fitz
        from docx import Document
        from docx.shared import Inches, Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        return False, None, "PyMuPDF or python-docx not installed"
    
    try:
        pdf_doc = fitz.open(input_path)
        word_doc = Document()
        
        for page_num, page in enumerate(pdf_doc):
            if page_num > 0:
                word_doc.add_page_break()
            
            # Extract text blocks with position info
            blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
            
            for block in blocks:
                if block["type"] == 0:  # Text block
                    for line in block.get("lines", []):
                        line_text = ""
                        for span in line.get("spans", []):
                            line_text += span.get("text", "")
                        
                        if line_text.strip():
                            para = word_doc.add_paragraph()
                            run = para.add_run(line_text)
                            
                            # Try to preserve font size
                            if line.get("spans"):
                                font_size = line["spans"][0].get("size", 11)
                                run.font.size = Pt(min(font_size, 72))  # Cap at 72pt
                
                elif block["type"] == 1:  # Image block
                    try:
                        # Extract image and add to document
                        img_data = block.get("image")
                        if img_data:
                            import io
                            img_stream = io.BytesIO(img_data)
                            word_doc.add_paragraph()
                            try:
                                word_doc.add_picture(img_stream, width=Inches(5))
                            except Exception:
                                # Skip problematic images
                                pass
                    except Exception:
                        pass
        
        pdf_doc.close()
        word_doc.save(output_path)
        
        if os.path.exists(output_path):
            return True, output_path, "PDF to DOCX conversion successful (fallback method)"
        return False, None, "Output file was not created"
        
    except Exception as e:
        logger.exception("PDF to DOCX fallback conversion error")
        return False, None, f"PDF to DOCX conversion failed: {str(e)}"


def convert_pdf_to_text(input_path: str, output_dir: str, use_ocr: bool = False) -> Tuple[bool, Optional[str], str]:
    """Extract text from PDF, with optional OCR for scanned documents."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return False, None, "PyMuPDF library not installed. Run: pip install PyMuPDF"
    
    try:
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.txt")
        
        doc = fitz.open(input_path)
        text_content = []
        truncated = len(doc) > MAX_OCR_PAGES

        for page_num, page in enumerate(doc):
            if use_ocr and page_num >= MAX_OCR_PAGES:
                break
            text = page.get_text()

            # If no text found and OCR is requested, try OCR
            if not text.strip() and use_ocr:
                ocr_text = _ocr_pdf_page(page, page_num)
                if ocr_text:
                    text = ocr_text

            if text.strip():
                text_content.append(f"--- Page {page_num + 1} ---\n{text}")

        doc.close()

        if use_ocr and truncated:
            text_content.append(f"\n[Truncated: OCR limited to the first {MAX_OCR_PAGES} pages]")
        
        full_text = "\n\n".join(text_content)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_text)
        
        return True, output_path, "PDF to text extraction successful"
        
    except Exception as e:
        logger.exception("PDF to text conversion error")
        return False, None, f"PDF to text conversion failed: {str(e)}"


def _ocr_pdf_page(page, page_num: int) -> Optional[str]:
    """Perform OCR on a PDF page."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.warning("pytesseract not available for OCR")
        return None
    
    try:
        # Render page to image
        pix = page.get_pixmap(dpi=300)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        # Perform OCR
        text = pytesseract.image_to_string(img)
        return text
    except Exception as e:
        logger.warning(f"OCR failed for page {page_num}: {e}")
        return None


def convert_pdf_to_images(
    input_path: str,
    output_dir: str,
    output_format: str = 'png',
    quality: str = 'high',
) -> Tuple[bool, Optional[str], str]:
    """Convert PDF pages to images."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return False, None, "PyMuPDF library not installed"
    
    try:
        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['high'])
        dpi = preset['dpi']
        
        doc = fitz.open(input_path)
        input_basename = Path(input_path).stem
        
        output_files = []
        for page_num, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi)
            
            if len(doc) == 1:
                output_path = os.path.join(output_dir, f"{input_basename}.{output_format}")
            else:
                output_path = os.path.join(output_dir, f"{input_basename}_page{page_num + 1}.{output_format}")
            
            if output_format.lower() in ('jpg', 'jpeg'):
                pix.save(output_path, output="jpeg", jpg_quality=preset['image_quality'])
            else:
                pix.save(output_path)
            
            output_files.append(output_path)
        
        doc.close()
        
        # Return the first file (or only file for single-page PDFs)
        if output_files:
            return True, output_files[0], f"Converted {len(output_files)} page(s) to {output_format.upper()}"
        return False, None, "No pages converted"
        
    except Exception as e:
        logger.exception("PDF to image conversion error")
        return False, None, f"PDF to image conversion failed: {str(e)}"


def convert_pdf_to_markdown(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert PDF to Markdown using PyMuPDF text extraction."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return False, None, "PyMuPDF library not installed. Run: pip install PyMuPDF"

    try:
        doc = fitz.open(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.md")

        md_parts = [f"# {input_basename}\n"]

        for page_num, page in enumerate(doc):
            if page_num > 0:
                md_parts.append(f"\n---\n")
            md_parts.append(f"\n## Page {page_num + 1}\n")

            blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

            for block in blocks:
                if block["type"] == 0:  # Text block
                    for line in block.get("lines", []):
                        spans = line.get("spans", [])
                        line_text = ""
                        for span in spans:
                            text = span.get("text", "")
                            if not text.strip():
                                line_text += text
                                continue
                            size = span.get("size", 12)
                            flags = span.get("flags", 0)
                            is_bold = flags & 2**4  # bit 4 = bold
                            is_italic = flags & 2**1  # bit 1 = italic

                            if is_bold and is_italic:
                                text = f"***{text.strip()}*** "
                            elif is_bold:
                                text = f"**{text.strip()}** "
                            elif is_italic:
                                text = f"*{text.strip()}* "
                            line_text += text

                        line_text = line_text.rstrip()
                        if line_text:
                            md_parts.append(line_text)
                elif block["type"] == 1:  # Image block
                    md_parts.append("\n*[Image]*\n")

            md_parts.append("")  # blank line after page content

        doc.close()

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(md_parts))

        return True, output_path, "PDF to Markdown conversion successful"

    except Exception as e:
        logger.exception("PDF to Markdown conversion error")
        return False, None, f"PDF to Markdown conversion failed: {str(e)}"


def convert_pdf_to_html(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert PDF to HTML with embedded styles."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return False, None, "PyMuPDF library not installed"
    
    try:
        doc = fitz.open(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.html")
        
        html_parts = ["""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted PDF</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
        .page { border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
        .page-header { color: #888; font-size: 12px; margin-bottom: 10px; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
    </style>
</head>
<body>
"""]
        
        for page_num, page in enumerate(doc):
            text = page.get_text("html")
            # Extract just the body content from the HTML
            if "<body>" in text:
                text = text.split("<body>")[1].split("</body>")[0]
            
            html_parts.append(f'<div class="page">')
            html_parts.append(f'<div class="page-header">Page {page_num + 1}</div>')
            html_parts.append(text)
            html_parts.append('</div>')
        
        html_parts.append("</body></html>")
        
        doc.close()
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(html_parts))
        
        return True, output_path, "PDF to HTML conversion successful"
        
    except Exception as e:
        logger.exception("PDF to HTML conversion error")
        return False, None, f"PDF to HTML conversion failed: {str(e)}"


# ---------------------------------------------------------------------------
# DOCX Conversions
# ---------------------------------------------------------------------------

def convert_docx_to_pdf(input_path: str, output_dir: str, quality: str = 'high') -> Tuple[bool, Optional[str], str]:
    """Convert DOCX to PDF using python-docx and reportlab."""
    try:
        from docx import Document
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
        from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    except ImportError:
        return False, None, "python-docx or reportlab not installed"
    
    try:
        doc = Document(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.pdf")
        
        # Create PDF
        pdf_doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=inch,
            leftMargin=inch,
            topMargin=inch,
            bottomMargin=inch,
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles
        styles.add(ParagraphStyle(
            name='DocxNormal',
            parent=styles['Normal'],
            fontSize=11,
            leading=14,
            spaceBefore=6,
            spaceAfter=6,
        ))
        styles.add(ParagraphStyle(
            name='DocxHeading1',
            parent=styles['Heading1'],
            fontSize=18,
            spaceBefore=12,
            spaceAfter=6,
        ))
        styles.add(ParagraphStyle(
            name='DocxHeading2',
            parent=styles['Heading2'],
            fontSize=14,
            spaceBefore=10,
            spaceAfter=4,
        ))
        
        story = []
        
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                story.append(Spacer(1, 6))
                continue
            
            # Determine style based on paragraph style
            style_name = para.style.name if para.style else ''
            
            if 'Heading 1' in style_name:
                style = styles['DocxHeading1']
            elif 'Heading 2' in style_name or 'Heading 3' in style_name:
                style = styles['DocxHeading2']
            else:
                style = styles['DocxNormal']
            
            # Escape special characters for ReportLab
            text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            
            try:
                p = Paragraph(text, style)
                story.append(p)
            except Exception:
                # If paragraph fails, add as plain text
                story.append(Paragraph(text[:500], styles['DocxNormal']))
        
        if story:
            pdf_doc.build(story)
        else:
            # Create empty PDF with a message
            pdf_doc.build([Paragraph("Document converted successfully", styles['Normal'])])
        
        return True, output_path, "DOCX to PDF conversion successful"
        
    except Exception as e:
        logger.exception("DOCX to PDF conversion error")
        return False, None, f"DOCX to PDF conversion failed: {str(e)}"


def convert_docx_to_text(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Extract text from DOCX."""
    try:
        from docx import Document
    except ImportError:
        return False, None, "python-docx not installed"
    
    try:
        doc = Document(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.txt")
        
        text_parts = []
        for para in doc.paragraphs:
            text_parts.append(para.text)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(text_parts))
        
        return True, output_path, "DOCX to text conversion successful"
        
    except Exception as e:
        logger.exception("DOCX to text conversion error")
        return False, None, f"DOCX to text conversion failed: {str(e)}"


def convert_docx_to_html(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert DOCX to HTML."""
    try:
        from docx import Document
    except ImportError:
        return False, None, "python-docx not installed"
    
    try:
        doc = Document(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.html")
        
        html_parts = ["""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted Document</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
        h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; }
        p { margin: 1em 0; }
    </style>
</head>
<body>
"""]
        
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            
            style_name = para.style.name if para.style else ''
            text_escaped = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            
            if 'Heading 1' in style_name:
                html_parts.append(f'<h1>{text_escaped}</h1>')
            elif 'Heading 2' in style_name:
                html_parts.append(f'<h2>{text_escaped}</h2>')
            elif 'Heading 3' in style_name:
                html_parts.append(f'<h3>{text_escaped}</h3>')
            else:
                html_parts.append(f'<p>{text_escaped}</p>')
        
        html_parts.append("</body></html>")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(html_parts))
        
        return True, output_path, "DOCX to HTML conversion successful"
        
    except Exception as e:
        logger.exception("DOCX to HTML conversion error")
        return False, None, f"DOCX to HTML conversion failed: {str(e)}"


def convert_text_to_pdf(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert plain text to PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    except ImportError:
        return False, None, "reportlab not installed"
    
    try:
        with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
            text_content = f.read()
        
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.pdf")
        
        pdf_doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=inch,
            leftMargin=inch,
            topMargin=inch,
            bottomMargin=inch,
        )
        
        styles = getSampleStyleSheet()
        story = []
        
        for line in text_content.split('\n'):
            if line.strip():
                # Escape special characters
                line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                try:
                    story.append(Paragraph(line, styles['Normal']))
                except:
                    story.append(Paragraph(line[:200], styles['Normal']))
            else:
                story.append(Spacer(1, 6))
        
        if story:
            pdf_doc.build(story)
        else:
            pdf_doc.build([Paragraph("Empty document", styles['Normal'])])
        
        return True, output_path, "Text to PDF conversion successful"
        
    except Exception as e:
        logger.exception("Text to PDF conversion error")
        return False, None, f"Text to PDF conversion failed: {str(e)}"


# ---------------------------------------------------------------------------
# Image Conversions
# ---------------------------------------------------------------------------

def convert_image(
    input_path: str,
    output_format: str,
    output_dir: str,
    quality: str = 'high',
) -> Tuple[bool, Optional[str], str]:
    """Convert image using Pillow."""
    try:
        from PIL import Image
    except ImportError:
        return False, None, "Pillow library not installed"
    
    try:
        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['high'])
        
        with Image.open(input_path) as img:
            # Handle different modes
            if output_format.lower() in ('jpg', 'jpeg'):
                if img.mode in ('RGBA', 'P', 'LA'):
                    # Create white background for transparency
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if len(img.split()) == 4 else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
            
            input_basename = Path(input_path).stem
            output_path = os.path.join(output_dir, f"{input_basename}.{output_format}")
            
            save_kwargs = {}
            if output_format.lower() in ('jpg', 'jpeg'):
                save_kwargs['quality'] = preset['image_quality']
                save_kwargs['optimize'] = True
            elif output_format.lower() == 'png':
                save_kwargs['optimize'] = True
            elif output_format.lower() == 'webp':
                save_kwargs['quality'] = preset['image_quality']
            elif output_format.lower() in ('tiff', 'tif'):
                save_kwargs['compression'] = 'tiff_lzw'
            
            img.save(output_path, **save_kwargs)
            
            return True, output_path, "Image conversion successful"
            
    except Exception as e:
        logger.exception("Image conversion error")
        return False, None, f"Image conversion failed: {str(e)}"


def convert_image_to_pdf(input_path: str, output_dir: str, quality: str = 'high') -> Tuple[bool, Optional[str], str]:
    """Convert image to PDF."""
    try:
        from PIL import Image
    except ImportError:
        return False, None, "Pillow not installed"
    
    try:
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.pdf")
        
        with Image.open(input_path) as img:
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if len(img.split()) == 4 else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Save as PDF directly using Pillow
            img.save(output_path, 'PDF', resolution=QUALITY_PRESETS.get(quality, QUALITY_PRESETS['high'])['dpi'])
        
        return True, output_path, "Image to PDF conversion successful"
        
    except Exception as e:
        logger.exception("Image to PDF conversion error")
        return False, None, f"Image to PDF conversion failed: {str(e)}"


# ---------------------------------------------------------------------------
# Spreadsheet Conversions
# ---------------------------------------------------------------------------

def _fmt_cell(v) -> str:
    """Format a single cell value cleanly."""
    import datetime
    if v is None:
        return ''
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, datetime.date):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, float):
        if v != v:   # NaN
            return ''
        return str(int(v)) if v == int(v) else str(round(v, 6))
    if isinstance(v, bool):
        return 'Yes' if v else 'No'
    return str(v).strip()


def _read_excel_smart(input_path: str) -> List[Tuple[str, List[List]]]:
    """
    Read Excel cleanly: merged-cell top-left keeps value, secondary cells → ''.
    No NaN, no 'Unnamed', no repetition of merged values.
    """
    ext = Path(input_path).suffix.lower()

    if ext == '.xls':
        try:
            import pandas as pd
            df = pd.read_excel(input_path, engine='xlrd', header=None)
            rows = [[_fmt_cell(v) for v in r] for r in df.values.tolist()]
            rows = [r for r in rows if any(c for c in r)]
            return [('Sheet1', rows)]
        except Exception:
            return []

    import openpyxl
    wb = openpyxl.load_workbook(input_path, data_only=True)
    result = []

    for ws in wb.worksheets:
        # Identify secondary merged cells (non top-left within any merge range)
        secondary: set = set()
        for mr in ws.merged_cells.ranges:
            for r in range(mr.min_row, mr.max_row + 1):
                for c in range(mr.min_col, mr.max_col + 1):
                    if not (r == mr.min_row and c == mr.min_col):
                        secondary.add((r, c))

        rows = []
        for ri, row in enumerate(ws.iter_rows(values_only=False), start=1):
            cells = []
            for ci, cell in enumerate(row, start=1):
                cells.append('' if (ri, ci) in secondary else _fmt_cell(cell.value))
            rows.append(cells)

        rows = [r for r in rows if any(c for c in r)]
        if not rows:
            continue

        max_cols = max(len(r) for r in rows)
        rows = [r + [''] * (max_cols - len(r)) for r in rows]
        live_cols = [ci for ci in range(max_cols) if any(rows[ri][ci] for ri in range(len(rows)))]
        rows = [[row[ci] for ci in live_cols] for row in rows]
        result.append((ws.title, rows))

    return result


def _read_excel_for_pdf(input_path: str):
    """
    Read Excel for PDF, returning (sheet_name, rows, spans) per sheet.
    spans = list of (r1, c1, r2, c2) in filtered-grid 0-based coordinates
    for ReportLab SPAN commands.
    """
    ext = Path(input_path).suffix.lower()
    if ext == '.xls':
        return [(name, rows, []) for name, rows in _read_excel_smart(input_path)]

    import openpyxl
    wb = openpyxl.load_workbook(input_path, data_only=True)
    result = []

    for ws in wb.worksheets:
        merge_ranges = list(ws.merged_cells.ranges)
        secondary: set = set()
        for mr in merge_ranges:
            for r in range(mr.min_row, mr.max_row + 1):
                for c in range(mr.min_col, mr.max_col + 1):
                    if not (r == mr.min_row and c == mr.min_col):
                        secondary.add((r, c))

        raw = []
        for ri, row in enumerate(ws.iter_rows(values_only=False), start=1):
            cells = []
            for ci, cell in enumerate(row, start=1):
                cells.append('' if (ri, ci) in secondary else _fmt_cell(cell.value))
            raw.append(cells)

        # Drop empty rows / cols, track the mapping
        live_rows = [ri for ri, r in enumerate(raw) if any(c for c in r)]
        if not live_rows:
            continue
        max_cols = max(len(raw[ri]) for ri in live_rows)
        raw = [r + [''] * (max_cols - len(r)) for r in raw]
        live_cols = [ci for ci in range(max_cols) if any(raw[ri][ci] for ri in live_rows)]

        row_map = {orig: new for new, orig in enumerate(live_rows)}   # orig 0-based → grid 0-based
        col_map = {orig: new for new, orig in enumerate(live_cols)}

        rows = [[raw[ri][ci] for ci in live_cols] for ri in live_rows]

        # Map each Excel merge range to grid SPAN coordinates
        spans = []
        for mr in merge_ranges:
            r1e, c1e = mr.min_row - 1, mr.min_col - 1   # 0-based excel
            r2e, c2e = mr.max_row - 1, mr.max_col - 1

            if r1e not in row_map or c1e not in col_map:
                continue

            # Find furthest live row/col within merge range
            r2g = max((row_map[r] for r in range(r1e, r2e + 1) if r in row_map), default=row_map[r1e])
            c2g = max((col_map[c] for c in range(c1e, c2e + 1) if c in col_map), default=col_map[c1e])
            r1g, c1g = row_map[r1e], col_map[c1e]

            if r1g != r2g or c1g != c2g:
                spans.append((r1g, c1g, r2g, c2g))

        result.append((ws.title, rows, spans))

    return result


def convert_csv_to_xlsx(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert CSV to Excel."""
    try:
        import pandas as pd
    except ImportError:
        return False, None, "pandas library not installed"
    
    try:
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                df = pd.read_csv(input_path, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            df = pd.read_csv(input_path, encoding='utf-8', errors='ignore')
        
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.xlsx")
        
        df.to_excel(output_path, index=False, engine='openpyxl')
        
        return True, output_path, "CSV to Excel conversion successful"
        
    except Exception as e:
        logger.exception("CSV to Excel conversion error")
        return False, None, f"CSV to Excel conversion failed: {str(e)}"


def convert_xlsx_to_csv(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert Excel to CSV with full merged-cell support."""
    import csv

    try:
        sheets = _read_excel_smart(input_path)
        if not sheets:
            return False, None, "No readable data found in Excel file"

        input_basename = Path(input_path).stem

        if len(sheets) == 1:
            output_path = os.path.join(output_dir, f"{input_basename}.csv")
            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerows(sheets[0][1])
            return True, output_path, "Excel to CSV conversion successful"
        else:
            # Multiple sheets → write to one CSV separated by sheet name headers
            output_path = os.path.join(output_dir, f"{input_basename}.csv")
            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                for sheet_name, rows in sheets:
                    writer.writerow([f'=== {sheet_name} ==='])
                    writer.writerows(rows)
                    writer.writerow([])
            return True, output_path, "Excel to CSV conversion successful"

    except Exception as e:
        logger.exception("Excel to CSV conversion error")
        return False, None, f"Excel to CSV conversion failed: {str(e)}"


def convert_xlsx_to_pdf(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert Excel to PDF — merged cells rendered with SPAN, auto-sized columns."""
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return False, None, "reportlab not installed"

    try:
        sheets = _read_excel_for_pdf(input_path)
        if not sheets:
            return False, None, "No readable data found in Excel file"

        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.pdf")
        styles = getSampleStyleSheet()

        # Page usable width in landscape A4
        PAGE_W = landscape(A4)[0] - inch          # ~10.7 inch usable

        header_style = ParagraphStyle('SheetHeader', parent=styles['Heading2'],
                                      fontSize=12, spaceAfter=4)
        story = []

        for sheet_name, rows, spans in sheets:
            if not rows:
                continue

            story.append(Paragraph(sheet_name, header_style))
            story.append(Spacer(1, 0.08 * inch))

            num_cols = max(len(r) for r in rows) if rows else 1

            # Compute per-column max char width, then proportional inch widths
            col_max = [0] * num_cols
            for row in rows:
                for ci, cell in enumerate(row):
                    col_max[ci] = max(col_max[ci], len(str(cell)))
            total_chars = sum(col_max) or 1
            raw_widths = [PAGE_W * (w / total_chars) for w in col_max]
            # Clamp: min 0.3 inch, max 3 inch
            col_widths = [max(0.3 * inch, min(3.0 * inch, w)) for w in raw_widths]
            # Scale so total fits page
            total_w = sum(col_widths)
            if total_w > PAGE_W:
                scale = PAGE_W / total_w
                col_widths = [w * scale for w in col_widths]

            # Ensure all rows have same column count (pad with '')
            display = [row + [''] * (num_cols - len(row)) for row in rows]
            # Truncate very long cells
            display = [[v[:60] if len(v) > 60 else v for v in row] for row in display]

            # Alternate row colors
            n_rows = len(display)
            row_bgs = []
            for ri in range(1, n_rows):
                bg = colors.HexColor('#F8FAFC') if ri % 2 == 0 else colors.white
                row_bgs.extend([('BACKGROUND', (0, ri), (-1, ri), bg)])

            # Build base style
            ts = TableStyle([
                # Header row
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('TOPPADDING', (0, 0), (-1, 0), 5),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
                # Data
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('TOPPADDING', (0, 1), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
                # Grid
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('WORDWRAP', (0, 0), (-1, -1), True),
            ] + row_bgs)

            # Add SPAN commands for merged cells
            for r1, c1, r2, c2 in spans:
                if r1 < n_rows and c1 < num_cols:
                    ts.add('SPAN', (c1, r1), (min(c2, num_cols - 1), min(r2, n_rows - 1)))
                    ts.add('ALIGN', (c1, r1), (min(c2, num_cols - 1), min(r2, n_rows - 1)), 'CENTER')

            table = Table(display, colWidths=col_widths, repeatRows=1)
            table.setStyle(ts)
            story.append(table)
            story.append(Spacer(1, 0.25 * inch))

        pdf_doc = SimpleDocTemplate(
            output_path,
            pagesize=landscape(A4),
            rightMargin=0.5 * inch, leftMargin=0.5 * inch,
            topMargin=0.5 * inch, bottomMargin=0.5 * inch,
        )
        pdf_doc.build(story)
        return True, output_path, "Excel to PDF conversion successful"

    except Exception as e:
        logger.exception("Excel to PDF conversion error")
        return False, None, f"Excel to PDF conversion failed: {str(e)}"


# ---------------------------------------------------------------------------
# Markdown/HTML Conversions
# ---------------------------------------------------------------------------

def convert_markdown_to_html(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert Markdown to HTML."""
    try:
        import markdown
    except ImportError:
        return False, None, "markdown library not installed"
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        html_content = markdown.markdown(
            md_content,
            extensions=['extra', 'codehilite', 'tables', 'toc', 'fenced_code']
        )
        
        full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Converted Document</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }}
        h1, h2, h3 {{ color: #111; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }}
        pre {{ background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }}
        pre code {{ background: none; padding: 0; }}
        table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
        th {{ background: #f4f4f4; font-weight: 600; }}
        blockquote {{ border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }}
        a {{ color: #0066cc; }}
    </style>
</head>
<body>
{html_content}
</body>
</html>"""
        
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.html")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_html)
        
        return True, output_path, "Markdown to HTML conversion successful"
        
    except Exception as e:
        logger.exception("Markdown conversion error")
        return False, None, f"Markdown conversion failed: {str(e)}"


def convert_html_to_markdown(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert HTML to Markdown."""
    try:
        import html2text
    except ImportError:
        return False, None, "html2text library not installed"
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = False
        h.body_width = 0
        h.unicode_snob = True
        
        md_content = h.handle(html_content)
        
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.md")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        
        return True, output_path, "HTML to Markdown conversion successful"
        
    except Exception as e:
        logger.exception("HTML to Markdown conversion error")
        return False, None, f"HTML to Markdown conversion failed: {str(e)}"


def convert_markdown_to_pdf(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Convert Markdown to PDF via HTML then to PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    except ImportError:
        return False, None, "reportlab not installed"
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.pdf")
        
        pdf_doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=inch,
            leftMargin=inch,
            topMargin=inch,
            bottomMargin=inch,
        )
        
        styles = getSampleStyleSheet()
        story = []
        
        for line in md_content.split('\n'):
            line_stripped = line.strip()
            if line_stripped:
                # Escape special characters
                line_escaped = line_stripped.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                
                # Basic markdown heading detection
                if line_stripped.startswith('# '):
                    text = line_escaped[2:]
                    story.append(Paragraph(f"<b><font size='18'>{text}</font></b>", styles['Normal']))
                elif line_stripped.startswith('## '):
                    text = line_escaped[3:]
                    story.append(Paragraph(f"<b><font size='14'>{text}</font></b>", styles['Normal']))
                elif line_stripped.startswith('### '):
                    text = line_escaped[4:]
                    story.append(Paragraph(f"<b><font size='12'>{text}</font></b>", styles['Normal']))
                else:
                    try:
                        story.append(Paragraph(line_escaped, styles['Normal']))
                    except:
                        pass
            else:
                story.append(Spacer(1, 6))
        
        if story:
            pdf_doc.build(story)
        else:
            pdf_doc.build([Paragraph("Empty document", styles['Normal'])])
        
        return True, output_path, "Markdown to PDF conversion successful"
        
    except Exception as e:
        logger.exception("Markdown to PDF conversion error")
        return False, None, f"Markdown to PDF conversion failed: {str(e)}"


# ---------------------------------------------------------------------------
# OCR Functions
# ---------------------------------------------------------------------------

def perform_ocr_on_pdf(input_path: str, output_dir: str) -> Tuple[bool, Optional[str], str]:
    """Perform OCR on a scanned PDF and return searchable text."""
    try:
        import fitz
        import pytesseract
        from PIL import Image
    except ImportError:
        return False, None, "PyMuPDF or pytesseract not installed"
    
    try:
        doc = fitz.open(input_path)
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}_ocr.txt")

        text_parts = []
        truncated = len(doc) > MAX_OCR_PAGES

        for page_num, page in enumerate(doc):
            if page_num >= MAX_OCR_PAGES:
                break
            # First try to get existing text
            text = page.get_text()

            if not text.strip():
                # No text found, perform OCR
                pix = page.get_pixmap(dpi=300)
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))

                text = pytesseract.image_to_string(img)

            if text.strip():
                text_parts.append(f"=== Page {page_num + 1} ===\n{text}")

        doc.close()

        if truncated:
            text_parts.append(f"\n[Truncated: OCR limited to the first {MAX_OCR_PAGES} pages]")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(text_parts))
        
        return True, output_path, f"OCR completed on {len(text_parts)} pages"
        
    except Exception as e:
        logger.exception("OCR error")
        return False, None, f"OCR failed: {str(e)}"


# ---------------------------------------------------------------------------
# Main Conversion Dispatcher
# ---------------------------------------------------------------------------

def convert_document(
    input_path: str,
    output_format: str,
    quality: str = 'high',
) -> Tuple[bool, Optional[str], str]:
    """
    Main conversion function. Dispatches to appropriate converter.
    Returns (success, output_path, message).
    """
    input_ext = Path(input_path).suffix.lower().lstrip('.')
    output_ext = output_format.lower().lstrip('.')

    if input_ext not in INPUT_FORMATS:
        return False, None, f"Unsupported input format: {input_ext}"

    # Create temp output directory
    output_dir = tempfile.mkdtemp(prefix='doc_convert_')
    success = False
    try:
        success, output_path, message = _dispatch_conversion(
            input_path, input_ext, output_ext, output_dir, quality
        )
        return success, output_path, message
    except Exception as e:
        logger.exception("Document conversion error")
        return False, None, str(e)
    finally:
        # Every controlled failure path below (unsupported format pair,
        # corrupt input, sub-converter returning False, ...) used to leak
        # output_dir — only the unhandled-exception path cleaned up. A
        # successful conversion's directory is left alone here; the caller
        # removes it later via cleanup_temp_file() once it has used the file.
        if not success and os.path.exists(output_dir):
            shutil.rmtree(output_dir, ignore_errors=True)


def _dispatch_conversion(input_path, input_ext, output_ext, output_dir, quality):
    """Format-pair dispatch used by convert_document(). Split out so the
    try/finally cleanup in convert_document() wraps every return path
    uniformly (see fix for temp-dir leak on controlled failure paths)."""
    # Same format - just copy
    if input_ext == output_ext:
        input_basename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{input_basename}.{output_ext}")
        shutil.copy2(input_path, output_path)
        return True, output_path, "File copied (same format)"

    # PDF conversions
    if input_ext == 'pdf':
        if output_ext == 'docx':
            return convert_pdf_to_docx(input_path, output_dir)
        elif output_ext == 'txt':
            return convert_pdf_to_text(input_path, output_dir, use_ocr=True)
        elif output_ext in ('png', 'jpg', 'jpeg'):
            return convert_pdf_to_images(input_path, output_dir, output_ext, quality)
        elif output_ext == 'html':
            return convert_pdf_to_html(input_path, output_dir)
        elif output_ext == 'md':
            return convert_pdf_to_markdown(input_path, output_dir)

    # DOCX conversions
    if input_ext == 'docx':
        if output_ext == 'pdf':
            return convert_docx_to_pdf(input_path, output_dir, quality)
        elif output_ext == 'txt':
            return convert_docx_to_text(input_path, output_dir)
        elif output_ext == 'html':
            return convert_docx_to_html(input_path, output_dir)
        elif output_ext == 'md':
            # DOCX → HTML → Markdown
            success, html_path, msg = convert_docx_to_html(input_path, output_dir)
            if success and html_path:
                return convert_html_to_markdown(html_path, output_dir)
            return False, None, msg

    # Text conversions
    if input_ext == 'txt':
        if output_ext == 'pdf':
            return convert_text_to_pdf(input_path, output_dir)
        elif output_ext == 'html':
            # Simple text to HTML
            with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
            text_escaped = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            html = f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>Document</title></head><body><pre>{text_escaped}</pre></body></html>"
            output_path = os.path.join(output_dir, f"{Path(input_path).stem}.html")
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)
            return True, output_path, "Text to HTML conversion successful"
        elif output_ext == 'md':
            # TXT → MD (just rename, plain text is valid markdown)
            output_path = os.path.join(output_dir, f"{Path(input_path).stem}.md")
            shutil.copy2(input_path, output_path)
            return True, output_path, "Text to Markdown conversion successful"

    # HTML conversions
    if input_ext in ('html', 'htm'):
        if output_ext == 'md':
            return convert_html_to_markdown(input_path, output_dir)
        elif output_ext == 'txt':
            try:
                from bs4 import BeautifulSoup
                with open(input_path, 'r', encoding='utf-8') as f:
                    soup = BeautifulSoup(f.read(), 'html.parser')
                text = soup.get_text(separator='\n')
                output_path = os.path.join(output_dir, f"{Path(input_path).stem}.txt")
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(text)
                return True, output_path, "HTML to text conversion successful"
            except Exception as e:
                return False, None, f"HTML to text failed: {str(e)}"

    # Markdown conversions
    if input_ext == 'md':
        if output_ext == 'html':
            return convert_markdown_to_html(input_path, output_dir)
        elif output_ext == 'pdf':
            return convert_markdown_to_pdf(input_path, output_dir)

    # Image conversions
    if get_file_category(input_ext) == 'images':
        if output_ext == 'pdf':
            return convert_image_to_pdf(input_path, output_dir, quality)
        elif get_file_category(output_ext) == 'images':
            return convert_image(input_path, output_ext, output_dir, quality)

    # Spreadsheet conversions
    if input_ext == 'csv':
        if output_ext == 'xlsx':
            return convert_csv_to_xlsx(input_path, output_dir)
        elif output_ext == 'pdf':
            # CSV -> XLSX -> PDF
            success, xlsx_path, msg = convert_csv_to_xlsx(input_path, output_dir)
            if success and xlsx_path:
                return convert_xlsx_to_pdf(xlsx_path, output_dir)
            return False, None, msg

    if input_ext in ('xlsx', 'xls'):
        if output_ext == 'csv':
            return convert_xlsx_to_csv(input_path, output_dir)
        elif output_ext == 'pdf':
            return convert_xlsx_to_pdf(input_path, output_dir)

    # Fallback: unsupported conversion
    return False, None, f"Conversion from {input_ext.upper()} to {output_ext.upper()} is not yet supported. Please try a different format combination."


def cleanup_temp_file(file_path: str):
    """Clean up a temporary file and its parent directory if empty."""
    try:
        if file_path and os.path.exists(file_path):
            parent_dir = os.path.dirname(file_path)
            os.remove(file_path)
            if parent_dir.startswith(tempfile.gettempdir()):
                try:
                    os.rmdir(parent_dir)
                except OSError:
                    pass
    except Exception as e:
        logger.warning(f"Failed to cleanup temp file {file_path}: {e}")
