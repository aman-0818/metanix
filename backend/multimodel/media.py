"""Development media serving with the same private prefixes as Nginx."""
import posixpath
from urllib.parse import unquote
from django.http import HttpResponseNotFound
from django.views.static import serve


def serve_public_media(request, path, document_root=None, **kwargs):
    normalized = posixpath.normpath(unquote(path).replace('\\', '/')).lstrip('/')
    if normalized.split('/', 1)[0] in ('knowledge_private', 'conversions'):
        return HttpResponseNotFound()
    return serve(request, normalized, document_root=document_root, **kwargs)
