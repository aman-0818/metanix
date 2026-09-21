"""PDF utilities executed only on the documents queue."""
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from django.conf import settings

OPERATIONS = ['merge', 'split', 'compress', 'rotate', 'reorder', 'watermark',
              'number_pages', 'add_password', 'remove_password', 'ocr']


def page_numbers(spec, total):
    if not spec:
        return list(range(total))
    result = []
    for part in str(spec).split(','):
        bounds = part.strip().split('-')
        if len(bounds) > 2 or not all(v.isdigit() for v in bounds):
            raise ValueError('Use page numbers such as 1,3,5-8.')
        first, last = int(bounds[0]), int(bounds[-1])
        if first < 1 or last > total or last < first:
            raise ValueError(f'Pages must be between 1 and {total}, in ascending ranges.')
        result.extend(range(first-1, last))
        if len(result) > total:
            raise ValueError('Each page may be selected only once.')
    if len(set(result)) != len(result):
        raise ValueError('Each page may be selected only once.')
    return result


def operate(paths, operation, options, progress):
    import fitz
    if operation not in OPERATIONS:
        raise ValueError('Unsupported PDF operation.')
    directory = tempfile.mkdtemp(prefix='metanix_pdf_')
    output = os.path.join(directory, 'result.pdf')
    docs = []
    protected = False
    try:
        for path in paths:
            doc = fitz.open(path)
            docs.append(doc)
            protected = protected or doc.needs_pass
            if doc.needs_pass and not doc.authenticate(options.get('input_password', '')):
                raise ValueError('Password-protected PDF: enter the correct input password.')
        total = sum(len(doc) for doc in docs)
        if not total or total > 300:
            raise ValueError('PDF jobs must contain between 1 and 300 pages.')
        progress(15, 'PDFs validated')
        save_options = {'garbage': 4, 'deflate': True, 'encryption': fitz.PDF_ENCRYPT_NONE}
        if operation == 'add_password':
            password = options.get('output_password', '')
            if not 8 <= len(password) <= 40:
                raise ValueError('Use an output password containing 8–40 characters.')
            save_options.update(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw=password, user_pw=password)
        elif protected and operation != 'remove_password':
            # Apply this to every output, including split pages and OCR results.
            save_options.update(encryption=fitz.PDF_ENCRYPT_AES_256,
                                owner_pw=options.get('input_password'), user_pw=options.get('input_password'))
        doc = docs[0]
        if operation == 'merge':
            for i, other in enumerate(docs[1:], 1):
                doc.insert_pdf(other)
                progress(15 + int(i / len(docs) * 70), 'Merging documents')
        elif operation == 'ocr':
            if len(doc) > getattr(settings, 'MAX_OCR_PAGES', 50):
                raise ValueError('OCR page limit exceeded. Split the document first.')
            executable = shutil.which('ocrmypdf')
            if not executable:
                raise ValueError('OCR is not installed on the document worker. Install OCRmyPDF and Tesseract.')
            decrypted = os.path.join(directory, 'input.pdf')
            doc.save(decrypted, encryption=fitz.PDF_ENCRYPT_NONE)
            ocr_output = os.path.join(directory, 'ocr.pdf') if protected else output
            progress(25, 'Recognizing text')
            result = subprocess.run([executable, '--skip-text', '--jobs', '1', '--tesseract-timeout', '30',
                                     decrypted, ocr_output], capture_output=True, timeout=200, check=False)
            if result.returncode:
                raise ValueError('OCR failed. Check that the PDF is readable and the worker has its OCR dependencies.')
            if protected:
                with fitz.open(ocr_output) as searchable:
                    searchable.save(output, **save_options)
                os.remove(ocr_output)
            return output
        else:
            pages = page_numbers(options.get('pages'), len(doc))
            if operation == 'split':
                output = os.path.join(directory, 'pages.zip')
                with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
                    for i, index in enumerate(pages):
                        with fitz.open() as part:
                            part.insert_pdf(doc, from_page=index, to_page=index)
                            archive.writestr(f'page-{index+1}.pdf', part.tobytes(**save_options))
                        progress(15 + int((i+1) / len(pages) * 70), 'Splitting pages')
                return output
            if operation == 'reorder':
                doc.select(pages)
            elif operation in ('rotate', 'watermark', 'number_pages'):
                for i, index in enumerate(pages):
                    page = doc[index]
                    if operation == 'rotate':
                        angle = int(options.get('angle', 90))
                        if angle not in (90, 180, 270):
                            raise ValueError('Rotation must be 90, 180 or 270 degrees.')
                        page.set_rotation((page.rotation + angle) % 360)
                    elif operation == 'watermark':
                        text = options.get('text', '').strip()
                        if not text or len(text) > 100:
                            raise ValueError('Watermark text must contain 1–100 characters.')
                        page.insert_text((36, page.rect.height / 2), text, fontsize=24,
                                         color=(.6, .6, .6), fill_opacity=.35, overlay=True)
                    else:
                        page.insert_text((page.rect.width/2, page.rect.height-20),
                                         str(index+1), fontsize=10)
                    progress(15 + int((i+1) / len(pages) * 70), 'Updating pages')
        doc.save(output, **save_options)
        progress(90, 'Saving output')
        return output
    except Exception:
        for doc in docs: doc.close()
        docs = []
        shutil.rmtree(directory, ignore_errors=True)
        raise
    finally:
        for doc in docs: doc.close()


def office_to_pdf(input_path, output_dir):
    executable = shutil.which('soffice') or shutil.which('libreoffice')
    if not executable:
        return None
    # Separate profile per job prevents headless processes sharing a lock.
    with tempfile.TemporaryDirectory(prefix='metanix_office_') as profile:
        result = subprocess.run([executable, f'-env:UserInstallation={Path(profile).as_uri()}',
                                 '--headless', '--convert-to', 'pdf', '--outdir', output_dir, input_path],
                                capture_output=True, timeout=120, check=False)
    output = os.path.join(output_dir, Path(input_path).stem + '.pdf')
    if result.returncode or not os.path.isfile(output):
        raise ValueError('Office conversion failed. Check that the file opens correctly in an office application.')
    return output
