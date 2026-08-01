"""
Slide image generation via the configured image LLMProvider.

Best-effort: any failure (no provider configured, no key, network error,
bad response shape, timeout, non-2xx) is logged as a warning and returns
None so the caller (pptx_generator) can fall back to an illustrated
placeholder instead of breaking deck generation.
"""
import base64
import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# gpt-image-* generation commonly takes 30-90s (vs DALL-E's few seconds) —
# this runs inside the async pptx Celery task, so a longer wait costs nothing
# user-facing; it just needs to be well under Celery's own task time limit.
IMAGE_GEN_TIMEOUT_S = 90


def generate_slide_image(description: str) -> Optional[bytes]:
    if not description or not description.strip():
        return None

    from ..models import LLMProvider

    provider = LLMProvider.get_image_provider()
    if provider is None:
        return None

    api_key = provider.get_api_key()
    if not api_key:
        logger.warning("Image provider %s configured but no API key available", provider.name)
        return None

    try:
        if provider.provider_type in ('azure_openai', 'azure_ai_foundry'):
            # Admins may paste either the bare resource root
            # (https://x.cognitiveservices.azure.com) or a full deployment URL
            # copied straight from a portal/curl example
            # (.../openai/deployments/<name>/images/generations?api-version=...).
            # Handle both instead of blindly appending the path onto whatever's there.
            endpoint = provider.api_endpoint.rstrip('/')
            base = endpoint.split('?')[0]
            if '/openai/deployments/' not in base:
                base = f"{base}/openai/deployments/{provider.model_name}/images/generations"
            url = base
            params = {"api-version": provider.api_version or "2024-04-01-preview"}
            headers = {"api-key": api_key, "Content-Type": "application/json"}
            # gpt-image-* models (unlike DALL-E) commonly take 30-90s and expect
            # quality/output_format explicitly rather than relying on defaults.
            body = {
                "prompt": description[:4000], "n": 1, "size": "1024x1024",
                "quality": "medium", "output_format": "png",
            }
            resp = requests.post(url, params=params, headers=headers, json=body, timeout=IMAGE_GEN_TIMEOUT_S)
        else:
            # OpenAI-compatible: openai, custom, together, etc.
            url = f"{(provider.api_endpoint or 'https://api.openai.com/v1').rstrip('/')}/images/generations"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            body = {"model": provider.model_name, "prompt": description[:4000], "n": 1, "size": "1024x1024"}
            resp = requests.post(url, headers=headers, json=body, timeout=IMAGE_GEN_TIMEOUT_S)

        resp.raise_for_status()
        data = resp.json()["data"][0]

        if data.get("b64_json"):
            return base64.b64decode(data["b64_json"])
        if data.get("url"):
            img_resp = requests.get(data["url"], timeout=IMAGE_GEN_TIMEOUT_S)
            img_resp.raise_for_status()
            return img_resp.content

        logger.warning("Image provider response had neither b64_json nor url: %s", list(data.keys()))
        return None
    except Exception as e:
        logger.warning("Image generation failed (falling back to illustrated placeholder): %s", e)
        return None


def _demo():
    """ponytail: smallest runnable check - no provider configured -> None, never raises."""
    assert generate_slide_image("") is None
    assert generate_slide_image("   ") is None
    # No image provider exists in a bare/dev environment -> must return None, not raise.
    assert generate_slide_image("a red bicycle") is None
    print("image_generator self-check OK")


if __name__ == "__main__":
    _demo()
