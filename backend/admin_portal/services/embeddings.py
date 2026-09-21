"""Shared, bounded embedding client for context and knowledge retrieval."""
import hashlib
import math

import httpx
from django.conf import settings
from django.core.cache import cache


class EmbeddingUnavailable(Exception):
    pass


def embedding_identity():
    values = [str(getattr(settings, key, '')) for key in
              ('EMBEDDING_BACKEND', 'EMBEDDING_ENDPOINT', 'EMBEDDING_MODEL', 'EMBEDDING_DIMENSIONS')]
    return hashlib.sha256('|'.join(values).encode()).hexdigest()


def embed(texts, *, scope):
    endpoint = getattr(settings, 'EMBEDDING_ENDPOINT', '')
    model = getattr(settings, 'EMBEDDING_MODEL', '')
    if not endpoint or not model:
        raise EmbeddingUnavailable('Configure EMBEDDING_ENDPOINT and EMBEDDING_MODEL.')
    if not texts or len(texts) > 32 or any(len(t.encode('utf-8')) > 24000 for t in texts):
        raise EmbeddingUnavailable('Embedding batch exceeds configured limits.')
    dimensions = getattr(settings, 'EMBEDDING_DIMENSIONS', 384)
    keys = ['embedding:' + hashlib.sha256(
        f'{scope}:{endpoint}:{model}:{dimensions}:{text}'.encode()).hexdigest() for text in texts]
    found = cache.get_many(keys)
    missing = list(dict.fromkeys(k for k in keys if k not in found))
    if missing:
        inputs = [texts[keys.index(key)] for key in missing]
        ollama = getattr(settings, 'EMBEDDING_BACKEND', 'ollama') == 'ollama'
        payload = {'model': model, 'input': inputs}
        if ollama:
            payload['truncate'] = False
        headers = {}
        key = getattr(settings, 'EMBEDDING_API_KEY', '')
        if key:
            headers['Authorization'] = f'Bearer {key}'
        try:
            response = httpx.post(endpoint, json=payload, headers=headers, timeout=10,
                                  follow_redirects=False)
            response.raise_for_status()
            data = response.json()
            vectors = data['embeddings'] if ollama else [
                row['embedding'] for row in sorted(data['data'], key=lambda row: row['index'])]
            if len(vectors) != len(missing):
                raise ValueError('Invalid embedding count')
            for vector in vectors:
                if (len(vector) != dimensions or not all(type(v) in (int, float) and math.isfinite(v) for v in vector)
                        or not any(vector) or not math.isfinite(sum(v*v for v in vector))):
                    raise ValueError('Invalid embedding dimensions or values')
            new = dict(zip(missing, vectors))
            cache.set_many(new, timeout=3600)
            found.update(new)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            # Provider exceptions can contain URLs or credentials. Do not expose them.
            raise EmbeddingUnavailable('Embedding service unavailable or invalid response.') from None
    return [found[key] for key in keys]


def cosine(left, right):
    if len(left) != len(right):
        return 0.0
    denominator = math.sqrt(sum(v*v for v in left) * sum(v*v for v in right))
    return sum(a*b for a, b in zip(left, right)) / denominator if denominator else 0.0
