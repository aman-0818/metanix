"""Safe, actionable provider errors without exposing keys or raw responses."""
import httpx


def chat_error(exc, provider):
    label = 'Gemini' if provider.provider_type == 'google' else 'The model provider'
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 429:
            daily = False
            try:
                error = exc.response.json().get('error', {})
                details = error.get('details', []) if isinstance(error, dict) else []
                daily = any('perday' in str(v.get('quotaId', '')).lower()
                            for detail in details if isinstance(detail, dict)
                            for v in detail.get('violations', []) if isinstance(v, dict))
            except (ValueError, AttributeError, TypeError, httpx.ResponseNotRead):
                pass
            if daily:
                return (f'{label} has reached its daily API quota. Wait for the daily quota to reset, '
                        'ask your administrator to review the provider plan, or select another configured model.', 429)
            return (f'{label} is rejecting requests because an API rate or quota limit was reached. '
                    'Try again later or ask your administrator to check the provider quota.', 429)
        if status in (401, 403):
            return (f'{label} rejected API access. Ask your administrator to check the API key and model permissions.', 502)
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return ('The model request timed out. Try again or select another configured model.', 504)
    return ('The AI model failed to respond. Please try again.', 502)
