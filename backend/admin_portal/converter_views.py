from django.db import transaction
from django.conf import settings
from rest_framework import permissions, serializers
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from .document_processor import validate_upload
from .models import ConversionJob, ConversionInput
from .serializers import ConversionJobSerializer
from .services.pdf_operations import OPERATIONS
from .services.document_converter import get_available_outputs
from .tasks import convert_document_task


class PDFOperationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'document_conversion'

    def post(self, request):
        user = request.user
        if not user.is_superuser and not user.has_document_converter:
            return Response({'error': 'Document converter access required.'}, status=403)
        files = request.FILES.getlist('files')
        operation = request.data.get('operation', '')
        if operation not in OPERATIONS + ['convert'] or not 1 <= len(files) <= 20:
            raise serializers.ValidationError('Choose an operation and between 1 and 20 files.')
        if operation not in ('merge', 'convert') and len(files) != 1:
            raise serializers.ValidationError('This operation accepts one PDF.')
        if operation == 'merge' and len(files) < 2:
            raise serializers.ValidationError('Select at least two PDFs to merge.')
        for file in files:
            ext, error = validate_upload(file, allowed_types=settings.CONVERTER_ALLOWED_UPLOAD_TYPES)
            if error:
                raise serializers.ValidationError({file.name: error})
            if operation != 'convert' and ext != 'pdf':
                raise serializers.ValidationError('PDF utilities accept PDF files only.')
            if operation == 'convert' and request.data.get('target_format') not in get_available_outputs(ext):
                raise serializers.ValidationError(f'Unsupported output for {file.name}.')
        options = {key: request.data.get(key, '') for key in ('pages', 'text', 'angle')}
        options['angle'] = options['angle'] or '90'
        if len(options['pages']) > 2000 or len(options['text']) > 100:
            raise serializers.ValidationError('Page selection or watermark text is too long.')
        for key in ('input_password', 'output_password'):
            value = request.data.get(key, '')
            if value:
                if len(value) > 40:
                    raise serializers.ValidationError('PDF passwords may contain at most 40 characters.')
                from .encryption import encrypt_api_key
                try:
                    options[key] = encrypt_api_key(value)
                except RuntimeError:
                    raise serializers.ValidationError('Password operations require the server encryption key to be configured.')
        jobs = []
        with transaction.atomic():
            for index, file in enumerate(files if operation == 'convert' else files[:1]):
                job = ConversionJob.objects.create(user=user, original_filename=file.name,
                    original_format=file.name.rsplit('.', 1)[-1].lower(), input_file=file,
                    file_size=file.size, operation=operation, options=options,
                    target_format=request.data.get('target_format', 'pdf') if operation == 'convert' else ('zip' if operation == 'split' else 'pdf'))
                if operation == 'merge':
                    for position, extra in enumerate(files[1:], 1):
                        ConversionInput.objects.create(job=job, file=extra, position=position)
                jobs.append(job)
                transaction.on_commit(lambda pk=job.pk: convert_document_task.delay(pk))
        return Response({'jobs': ConversionJobSerializer(jobs, many=True, context={'request': request}).data}, status=202)
