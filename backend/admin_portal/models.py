from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import F


class LLMProvider(models.Model):
    """
    DB-driven LLM provider configuration.
    Admin can add/edit providers from the UI — no code changes needed.
    """
    PROVIDER_TYPE_CHOICES = [
        ('azure_openai', 'Azure OpenAI'),
        ('azure_ai_foundry', 'Azure AI Foundry'),
        ('openai', 'OpenAI'),
        ('google', 'Google Gemini'),
        ('anthropic', 'Anthropic Claude'),
        ('groq', 'Groq'),
        ('deepseek', 'DeepSeek'),
        ('mistral', 'Mistral AI'),
        ('cohere', 'Cohere'),
        ('xai', 'xAI (Grok)'),
        ('perplexity', 'Perplexity'),
        ('together', 'Together AI'),
        ('ollama', 'Ollama (Local)'),
        ('huggingface', 'HuggingFace'),
        ('custom', 'Custom / OpenAI-compatible'),
    ]

    # Identity
    name = models.CharField(max_length=100, unique=True, db_index=True,
                            help_text='Slug used in URLs and permissions, e.g. "gpt4-mini"')
    display_name = models.CharField(max_length=200,
                                    help_text='Friendly label, e.g. "GPT-4.1 Mini"')
    description = models.TextField(blank=True, default='')
    icon_name = models.CharField(max_length=50, blank=True, default='sparkles',
                                 help_text='Lucide icon name for the frontend')

    PROVIDER_KIND_CHOICES = [
        ('chat', 'Chat / Text'),
        ('image', 'Image Generation'),
    ]

    # Provider routing
    provider_kind = models.CharField(max_length=10, choices=PROVIDER_KIND_CHOICES,
                                     default='chat', db_index=True,
                                     help_text='chat = shows in the model picker; image = used only by '
                                               'Presentation mode to illustrate image_placeholder slides')
    provider_type = models.CharField(max_length=30, choices=PROVIDER_TYPE_CHOICES,
                                     default='ollama', db_index=True)
    model_name = models.CharField(max_length=200,
                                  help_text='Model identifier, e.g. "gpt-4.1-mini", "gemini-2.5-flash"')
    api_endpoint = models.URLField(max_length=500, blank=True, default='',
                                   help_text='API endpoint URL. Leave blank for default.')
    api_version = models.CharField(max_length=30, blank=True, default='',
                                   help_text='API version string, e.g. "2024-12-01-preview"')
    api_key_env_var = models.CharField(max_length=100, blank=True, default='',
                                       help_text='Name of the .env variable holding the API key (fallback)')
    encrypted_api_key = models.TextField(blank=True, default='',
                                         help_text='Fernet-encrypted API key stored in DB (preferred)')

    # Configuration
    max_tokens = models.IntegerField(default=4096)
    temperature = models.FloatField(default=0.7)
    system_prompt = models.TextField(blank=True, default='',
                                     help_text='Default system prompt for this model')
    extra_config = models.JSONField(default=dict, blank=True,
                                    help_text='Additional provider-specific config as JSON')

    # Pricing (per 1 Million tokens in USD)
    input_cost_per_1m = models.FloatField(default=0.0,
                                           help_text='Cost per 1 million input (prompt) tokens in USD. e.g. 0.15 for GPT-4o-mini')
    cached_input_cost_per_1m = models.FloatField(default=0.0,
                                                 help_text='Cost per 1 million cached-input tokens in USD (0 if the model/deployment has no prompt caching)')
    output_cost_per_1m = models.FloatField(default=0.0,
                                            help_text='Cost per 1 million output (completion) tokens in USD. e.g. 0.60 for GPT-4o-mini')

    # Capabilities (feature flags)
    supports_code = models.BooleanField(default=True)
    supports_document_upload = models.BooleanField(default=False)
    supports_streaming = models.BooleanField(default=False)

    # Status & ordering
    is_active = models.BooleanField(default=True, db_index=True)
    is_default = models.BooleanField(default=False,
                                     help_text='Show as pre-selected for new users')
    sort_order = models.IntegerField(default=0,
                                     help_text='Lower = shown first')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'display_name']
        indexes = [
            models.Index(fields=['is_active', 'sort_order']),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.provider_type})"

    @classmethod
    def get_image_provider(cls):
        """The single active image-generation provider used by Presentation mode,
        or None if not configured — callers must fall back gracefully, never error."""
        return cls.objects.filter(provider_kind='image', is_active=True).order_by('sort_order').first()

    def get_api_key(self):
        """
        Retrieve the API key.  Priority:
        1. Encrypted key stored in DB (preferred)
        2. Fallback to .env via api_key_env_var
        """
        # 1) Try DB-encrypted key first
        if self.encrypted_api_key:
            from .encryption import decrypt_api_key
            decrypted = decrypt_api_key(self.encrypted_api_key)
            if decrypted:
                return decrypted
        # 2) Fallback: read from .env
        if self.api_key_env_var:
            from decouple import config
            return config(self.api_key_env_var, default='')
        return None

    def get_api_key_source(self):
        """Return where the API key is coming from: 'db', 'env', or 'none'."""
        if self.encrypted_api_key:
            from .encryption import decrypt_api_key
            if decrypt_api_key(self.encrypted_api_key):
                return 'db'
        if self.api_key_env_var:
            from decouple import config
            key = config(self.api_key_env_var, default='')
            if key and key.strip():
                return 'env'
        return 'none'

    def set_api_key(self, plaintext_key):
        """Encrypt and store an API key in the database."""
        if not plaintext_key:
            self.encrypted_api_key = ''
            self.save(update_fields=['encrypted_api_key'])
            return
        from .encryption import encrypt_api_key
        self.encrypted_api_key = encrypt_api_key(plaintext_key)
        self.save(update_fields=['encrypted_api_key'])

    def clear_api_key(self):
        """Remove the encrypted API key from DB."""
        self.encrypted_api_key = ''
        self.save(update_fields=['encrypted_api_key'])

    def save(self, *args, **kwargs):
        # Ensure only one default provider
        if self.is_default:
            LLMProvider.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class UserLLMPermission(models.Model):
    """
    Per-user, per-model permission with hour-based quotas.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='llm_permissions')
    llm_provider = models.ForeignKey(LLMProvider, on_delete=models.CASCADE,
                                     related_name='user_permissions')

    # Quota management
    quota_minutes = models.PositiveIntegerField(null=True, blank=True,
                                                help_text='Allowed usage in minutes. NULL = unlimited.')
    used_seconds = models.PositiveIntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)

    # Access control
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True,
                                      help_text='Permission expires at this time. NULL = never.')
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='granted_permissions')

    class Meta:
        unique_together = ['user', 'llm_provider']
        ordering = ['llm_provider__sort_order']
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.llm_provider.display_name}"

    def get_remaining_seconds(self):
        """Return remaining seconds, or None if unlimited."""
        if self.quota_minutes is None:
            return None
        total = self.quota_minutes * 60
        return max(0, total - self.used_seconds)

    def is_quota_exceeded(self):
        if self.quota_minutes is None:
            return False
        return self.used_seconds >= (self.quota_minutes * 60)

    def is_expired(self):
        if self.expires_at is None:
            return False
        return timezone.now() >= self.expires_at

    def is_usable(self):
        """Overall check: active, not expired, not over quota, provider active."""
        return (
            self.is_active
            and not self.is_quota_exceeded()
            and not self.is_expired()
            and self.llm_provider.is_active
        )

    def record_usage(self, duration_seconds):
        """Thread-safe atomic usage tracking."""
        UserLLMPermission.objects.filter(pk=self.pk).update(
            used_seconds=F('used_seconds') + int(duration_seconds),
            last_used_at=timezone.now()
        )


CHAT_MODE_CHOICES = [
    ('general', 'General Chat'),
    ('code', 'Code Assistant'),
    ('summarize', 'Summarizer'),
    ('document', 'Document Q&A'),
    ('presentation', 'Presentation Creator'),
]


class Project(models.Model):
    """User-defined grouping for conversations (sidebar 'Projects' section)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='projects')
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.user.username})"


class SavedPrompt(models.Model):
    """A reusable prompt snippet a user can click to populate the composer."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='saved_prompts')
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.text[:50]


class Conversation(models.Model):
    """Chat conversation linked to a specific LLM provider via FK."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='conversations')
    title = models.CharField(max_length=255, default='New Chat')
    llm_provider = models.ForeignKey(LLMProvider, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='conversations')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='conversations')
    chat_mode = models.CharField(max_length=20, choices=CHAT_MODE_CHOICES,
                                 default='general', db_index=True)
    last_export_format = models.CharField(max_length=10, blank=True, default='',
                                          help_text="Format of the most recent file export in this "
                                                    "conversation (docx/pdf/xlsx/csv/md/pptx) — lets a "
                                                    "vague follow-up like 'give me that too' or 'send it "
                                                    "again' reuse the same format instead of guessing docx.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'is_active', '-updated_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.user.username})"


class Message(models.Model):
    """Individual message in a conversation."""
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    llm_provider = models.ForeignKey(LLMProvider, on_delete=models.SET_NULL,
                                     null=True, blank=True,
                                     related_name='messages',
                                     help_text='The model that generated this message (assistant) or that was selected when the user sent it')
    token_count = models.IntegerField(default=0)
    pptx_url = models.CharField(max_length=500, blank=True, default='',
                                help_text='URL to generated PPTX file')
    pptx_theme = models.CharField(max_length=50, blank=True, default='',
                                  help_text='Theme used for PPTX generation')
    style_suggestions = models.JSONField(default=list, blank=True,
                                         help_text='Style suggestions from LLM')
    PPTX_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    pptx_status = models.CharField(max_length=20, choices=PPTX_STATUS_CHOICES,
                                   blank=True, default='',
                                   help_text='Status of async PPTX generation (blank = not a presentation message)')
    pptx_error = models.TextField(blank=True, default='',
                                  help_text='Error message if PPTX generation failed')
    EXPORT_FILE_TYPE_CHOICES = [
        ('docx', 'Word'),
        ('pdf', 'PDF'),
        ('xlsx', 'Excel'),
        ('pptx', 'PowerPoint'),
        ('csv', 'CSV'),
        ('md', 'Markdown'),
    ]
    export_file_url = models.CharField(max_length=500, blank=True, default='',
                                       help_text='URL to this reply rendered as a downloadable file')
    export_file_type = models.CharField(max_length=10, choices=EXPORT_FILE_TYPE_CHOICES,
                                        blank=True, default='')
    EXPORT_STATUS_CHOICES = [
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    export_status = models.CharField(max_length=20, choices=EXPORT_STATUS_CHOICES,
                                     blank=True, default='',
                                     help_text='Status of rendering this reply as a file (blank = no export requested)')
    export_error = models.TextField(blank=True, default='',
                                    help_text='Error message if file export failed')
    is_export_ack = models.BooleanField(default=False,
                                        help_text="True when this message's content is just the short "
                                                  "'here's your file' acknowledgment from a pure export "
                                                  "request (no LLM call was made) — NOT real material, so "
                                                  "a later pure export must skip past it when looking for "
                                                  "the last real reply to re-render, or repeated 'download "
                                                  "link' asks would keep exporting the previous ack instead "
                                                  "of the original content.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            # A single composite index serves both directions here: 'conversation'
            # is always filtered by equality, so Postgres can scan this index
            # backward to satisfy ORDER BY conversation, created_at just as
            # cheaply as forward — see _build_messages() (order_by('-created_at'))
            # and _maybe_summarize() (order_by('created_at')), both used against
            # this same index. The mirrored ['conversation', 'created_at'] index
            # was pure write overhead with no read benefit; removed via migration
            # 0029 (RemoveIndexConcurrently).
            models.Index(fields=['conversation', '-created_at']),
        ]

    def __str__(self):
        return f"{self.role}: {self.content[:50]}..."


class ConversationSummary(models.Model):
    """Auto-generated summary when conversation exceeds token limit."""
    conversation = models.OneToOneField(Conversation, on_delete=models.CASCADE,
                                        related_name='summary')
    summary = models.TextField()
    original_token_count = models.IntegerField(default=0)
    summarized_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Conversation summaries'

    def __str__(self):
        return f"Summary for: {self.conversation.title}"


class Document(models.Model):
    """Uploaded document for document-based Q&A."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='documents')
    conversation = models.ForeignKey(Conversation, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='documents')
    file = models.FileField(upload_to='documents/%Y/%m/%d/')
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10)
    file_size = models.PositiveIntegerField(default=0, help_text='Size in bytes')
    extracted_text = models.TextField(blank=True, default='')
    extraction_status = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                         default='pending', db_index=True)
    extraction_error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.original_filename


class ConversionJob(models.Model):
    """Track document conversion jobs."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='conversion_jobs')
    original_filename = models.CharField(max_length=255)
    original_format = models.CharField(max_length=20)
    target_format = models.CharField(max_length=20)
    quality = models.CharField(max_length=20, default='high')
    
    input_file = models.FileField(upload_to='conversions/input/')
    output_file = models.FileField(upload_to='conversions/output/', null=True, blank=True)
    
    file_size = models.PositiveIntegerField(default=0)
    output_file_size = models.PositiveIntegerField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True, default='')
    
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.original_filename} -> {self.target_format} ({self.status})"


class LLMUsageLog(models.Model):
    """Token usage and cost tracking per request."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name='llm_usage_logs')
    llm_provider = models.ForeignKey(LLMProvider, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='usage_logs')
    provider = models.CharField(max_length=50, db_index=True,
                                help_text='Provider type string for quick filtering')
    model = models.CharField(max_length=100, db_index=True)
    prompt_tokens = models.IntegerField(default=0)
    cached_tokens = models.IntegerField(default=0,
                                        help_text='Portion of prompt_tokens served from the provider\'s prompt cache '
                                                  '(0 if the model/request had no cache hit, or the provider does not report it)')
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    latency_ms = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'LLM usage log'
        verbose_name_plural = 'LLM usage logs'
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['provider', '-created_at']),
        ]

    def __str__(self):
        return f"{self.user} - {self.provider}/{self.model} - {self.total_tokens} tokens"


class AppConfig(models.Model):
    """
    App-wide key-value configuration stored in DB.
    Allows admin to tweak settings without code changes.
    """
    VALUE_TYPE_CHOICES = [
        ('string', 'String'),
        ('integer', 'Integer'),
        ('float', 'Float'),
        ('boolean', 'Boolean'),
        ('json', 'JSON'),
    ]
    CATEGORY_CHOICES = [
        ('general', 'General'),
        ('chat', 'Chat'),
        ('upload', 'Upload'),
        ('security', 'Security'),
    ]

    key = models.CharField(max_length=100, unique=True, db_index=True)
    value = models.TextField(blank=True, default='')
    value_type = models.CharField(max_length=10, choices=VALUE_TYPE_CHOICES, default='string')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='general')
    description = models.TextField(blank=True, default='')
    is_sensitive = models.BooleanField(default=False,
                                       help_text='If True, value is masked in admin UI')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'key']
        verbose_name = 'App configuration'
        verbose_name_plural = 'App configurations'

    def __str__(self):
        return f"{self.key} = {self.value[:50] if not self.is_sensitive else '***'}"

    def get_typed_value(self):
        """Return value cast to its declared type, or None if the stored value
        doesn't actually match its declared value_type (e.g. hand-edited to
        something malformed) — callers should treat None as "value unusable"."""
        import json
        try:
            if self.value_type == 'integer':
                return int(self.value) if self.value else 0
            elif self.value_type == 'float':
                return float(self.value) if self.value else 0.0
            elif self.value_type == 'boolean':
                return self.value.lower() in ('true', '1', 'yes')
            elif self.value_type == 'json':
                return json.loads(self.value) if self.value else {}
            return self.value
        except (ValueError, TypeError, json.JSONDecodeError):
            import logging
            logging.getLogger(__name__).warning(
                "AppConfig %r has a value that doesn't match its declared "
                "value_type %r: %r", self.key, self.value_type, self.value,
            )
            return None

    @classmethod
    def get(cls, key, default=None):
        """Convenience class method to read a config value."""
        try:
            obj = cls.objects.get(key=key)
        except cls.DoesNotExist:
            return default
        value = obj.get_typed_value()
        return default if value is None else value
