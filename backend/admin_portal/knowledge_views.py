import json
from django.db import transaction
from django.http import FileResponse
from rest_framework import permissions, serializers
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import User
from .document_processor import validate_upload
from .models import KnowledgeDocument
from .services.rag import accessible_documents
from .tasks import ingest_knowledge_task


class KnowledgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeDocument
        fields = ['id', 'title', 'version', 'allowed_roles', 'allowed_users', 'status',
                  'error', 'chunk_count', 'updated_at']
        read_only_fields = fields


def require_admin(user):
    if not user.is_admin():
        raise PermissionDenied('Administrator access required.')


def grants(data):
    def parse(key, default):
        value = data.get(key, default)
        try:
            return json.loads(value) if isinstance(value, str) else value
        except ValueError:
            raise serializers.ValidationError({key: 'Provide a JSON array.'})
    roles = parse('allowed_roles', [])
    users = parse('allowed_users', [])
    if not isinstance(roles, list) or any(role not in dict(User.ROLE_CHOICES) for role in roles):
        raise serializers.ValidationError('Invalid existing role.')
    if not isinstance(users, list) or any(type(pk) is not int for pk in users):
        raise serializers.ValidationError('User grants must be an array of user IDs.')
    if User.objects.filter(pk__in=users, is_active=True).count() != len(set(users)):
        raise serializers.ValidationError('One or more users do not exist or are inactive.')
    return roles, users


class KnowledgeListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        require_admin(request.user)
        docs = KnowledgeDocument.objects.prefetch_related('allowed_users').order_by('-updated_at')[:200]
        return Response(KnowledgeSerializer(docs, many=True).data)

    def post(self, request):
        require_admin(request.user)
        files = request.FILES.getlist('files')
        if not files or len(files) > 20:
            raise serializers.ValidationError('Upload between 1 and 20 documents.')
        roles, users = grants(request.data)
        for file in files:
            _, error = validate_upload(file)
            if error:
                raise serializers.ValidationError({file.name: error})
        docs = []
        with transaction.atomic():
            for file in files:
                doc = KnowledgeDocument.objects.create(owner=request.user, title=file.name,
                    file=file, file_type=file.name.rsplit('.', 1)[-1].lower(), allowed_roles=roles)
                doc.allowed_users.set(users)
                docs.append(doc)
                transaction.on_commit(lambda pk=doc.pk: ingest_knowledge_task.delay(pk, 1))
        return Response(KnowledgeSerializer(docs, many=True).data, status=202)


class KnowledgeDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pk):
        require_admin(request.user)
        with transaction.atomic():
            doc = KnowledgeDocument.objects.select_for_update().filter(pk=pk).first()
            if not doc:
                raise NotFound()
            roles, users = grants({'allowed_roles': request.data.get('allowed_roles', doc.allowed_roles),
                                   'allowed_users': request.data.get('allowed_users', list(doc.allowed_users.values_list('pk', flat=True)))})
            doc.allowed_roles = roles
            file = request.FILES.get('file')
            if file:
                ext, error = validate_upload(file)
                if error:
                    raise serializers.ValidationError(error)
                old_file = doc.file
                doc.file = file
                doc.file_type = ext
                doc.title = file.name
                doc.version += 1
                doc.status, doc.error, doc.chunk_count = 'pending', '', 0
                doc.chunks.all().delete()
            doc.allowed_users.set(users)
            doc.save()
            if file:
                transaction.on_commit(lambda: ingest_knowledge_task.delay(doc.pk, doc.version))
                transaction.on_commit(lambda: old_file.delete(save=False))
        return Response(KnowledgeSerializer(doc).data)

    def delete(self, request, pk):
        require_admin(request.user)
        with transaction.atomic():
            doc = KnowledgeDocument.objects.filter(pk=pk).first()
            if doc:
                file = doc.file
                doc.delete()
                transaction.on_commit(lambda: file.delete(save=False))
        return Response(status=204)

    def get(self, request, pk):
        doc = accessible_documents(request.user).filter(pk=pk).first()
        if not doc:
            raise NotFound()
        return FileResponse(doc.file.open('rb'), as_attachment=True, filename=doc.title)
