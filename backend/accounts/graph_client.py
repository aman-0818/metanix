import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


class GraphClient:
    def __init__(self):
        required_settings = [
            'AZURE_AD_CLIENT_ID',
            'AZURE_AD_CLIENT_SECRET', 
            'AZURE_AD_TENANT_ID'
        ]
        missing = [s for s in required_settings if not getattr(settings, s)]
        if missing:
            raise ValueError(f"Azure AD Graph credentials are not configured: {', '.join(missing)}")
        if not settings.AZURE_AD_GRAPH_SCOPES:
            raise ValueError("AZURE_AD_GRAPH_SCOPES is not configured")
        self._token = None

    def _get_token(self):
        if self._token:
            return self._token

        logger.info("Requesting new Graph API token")
        token_url = f"https://login.microsoftonline.com/{settings.AZURE_AD_TENANT_ID}/oauth2/v2.0/token"
        data = {
            "client_id": settings.AZURE_AD_CLIENT_ID,
            "client_secret": settings.AZURE_AD_CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": " ".join(settings.AZURE_AD_GRAPH_SCOPES),
        }
        response = requests.post(token_url, data=data, timeout=15)
        if not response.ok:
            logger.error(f"Graph token request failed: {response.status_code} - {response.text}")
            raise ValueError(f"Graph token request failed: {response.text}")
        self._token = response.json().get("access_token")
        if not self._token:
            logger.error("Graph token response missing access_token")
            raise ValueError("Graph token missing access_token")
        logger.info("Successfully obtained Graph API token")
        return self._token

    def _headers(self):
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

    def search_users(self, query: str, limit: int = 10):
        if not query or len(query.strip()) < 2:
            raise ValueError("Query must be at least 2 characters long")
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")
        query = query.strip()
        logger.info(f"Searching for users with query: '{query}', limit: {limit}")
        # Escape single quotes in query to prevent Graph API filter issues
        escaped_query = query.replace("'", "''")
        
        # Check if query looks like an Azure AD object ID (GUID)
        import re
        if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', query, re.IGNORECASE):
            # Search by exact ID match
            filter_query = f"id eq '{escaped_query}'"
            logger.info(f"Query appears to be Azure AD object ID, using exact ID match")
        else:
            # Search by name/email fields
            filter_parts = [
                f"startswith(userPrincipalName,'{escaped_query}')",
                f"startswith(mail,'{escaped_query}')",
                f"startswith(displayName,'{escaped_query}')",
            ]
            filter_query = " or ".join(filter_parts)
        
        url = "https://graph.microsoft.com/v1.0/users"
        params = {
            "$top": str(limit),
            "$filter": filter_query,
            "$select": "id,displayName,userPrincipalName,mail,givenName,surname,department,jobTitle,officeLocation",
        }
        
        response = requests.get(url, headers=self._headers(), params=params, timeout=15)
        if response.status_code == 401:
            logger.warning("Received 401, token may be expired, refreshing token and retrying")
            self._token = None  # Force token refresh
            response = requests.get(url, headers=self._headers(), params=params, timeout=15)
        
        if not response.ok:
            logger.error(f"Graph user search failed: {response.status_code} - {response.text}")
            raise ValueError(f"Graph user search failed: {response.text}")
        result = response.json().get("value", [])
        # Normalize Graph API field names to our format
        normalized = []
        for u in result:
            normalized.append({
                'ad_id': u.get('id', ''),
                'email': u.get('mail') or u.get('userPrincipalName', ''),
                'username': (u.get('userPrincipalName') or '').split('@')[0],
                'first_name': u.get('givenName', ''),
                'last_name': u.get('surname', ''),
                'display_name': u.get('displayName', ''),
                'department': u.get('department') or '',
                'job_title': u.get('jobTitle') or '',
                'location': u.get('officeLocation') or '',
                'upn': u.get('userPrincipalName') or '',
            })
        logger.info(f"Found {len(normalized)} users matching query")
        return normalized

    def get_user_by_id(self, user_id: str):
        """Get a user directly by their Azure AD object ID"""
        logger.info(f"Getting user by ID: {user_id}")
        url = f"https://graph.microsoft.com/v1.0/users/{user_id}"
        params = {
            "$select": "id,displayName,userPrincipalName,mail,givenName,surname",
        }
        
        response = requests.get(url, headers=self._headers(), params=params, timeout=15)
        if response.status_code == 401:
            logger.warning("Received 401, token may be expired, refreshing token and retrying")
            self._token = None  # Force token refresh
            response = requests.get(url, headers=self._headers(), params=params, timeout=15)
        
        if response.status_code == 404:
            logger.info(f"User with ID {user_id} not found")
            return None
            
        if not response.ok:
            logger.error(f"Graph get user by ID failed: {response.status_code} - {response.text}")
            raise ValueError(f"Graph get user by ID failed: {response.text}")
            
        result = response.json()
        logger.info(f"Successfully retrieved user: {result.get('displayName')}")
        return result
