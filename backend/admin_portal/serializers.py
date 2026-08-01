from rest_framework import serializers
from .models import (
    LLMProvider, UserLLMPermission, Conversation, Message,
    ConversationSummary, Document, LLMUsageLog, AppConfig, ConversionJob,
    Project, SavedPrompt,
)


# ---------------------------------------------------------------------------
#  LLM Provider
# ---------------------------------------------------------------------------

class LLMProviderSerializer(serializers.ModelSerializer):
    """Full read serializer — returned to admins."""
    has_api_key = serializers.SerializerMethodField()
    api_key_source = serializers.SerializerMethodField()
    api_key_preview = serializers.SerializerMethodField()
    
    class Meta:
        model = LLMProvider
        fields = [
            'id', 'name', 'display_name', 'description', 'icon_name',
            'provider_kind', 'provider_type', 'model_name', 'api_endpoint', 'api_version',
            'api_key_env_var', 'has_api_key', 'api_key_source', 'api_key_preview',
            'max_tokens', 'temperature', 'system_prompt',
            'input_cost_per_1m', 'cached_input_cost_per_1m', 'output_cost_per_1m',
            'extra_config', 'supports_code', 'supports_document_upload',
            'supports_streaming', 'is_active', 'is_default', 'sort_order',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'has_api_key', 'api_key_source', 'api_key_preview']
    
    def get_has_api_key(self, obj):
        """Check if API key is configured (DB or .env)."""
        if obj.provider_type == 'ollama':
            return True
        key = obj.get_api_key()
        return bool(key and key.strip())

    def get_api_key_source(self, obj):
        """Return where the key comes from: 'db', 'env', 'none', or 'ollama'."""
        if obj.provider_type == 'ollama':
            return 'ollama'
        return obj.get_api_key_source()

    def get_api_key_preview(self, obj):
        """Return masked preview of the API key (never the real key)."""
        if obj.provider_type == 'ollama':
            return ''
        key = obj.get_api_key()
        if not key or not key.strip():
            return ''
        from .encryption import mask_api_key
        return mask_api_key(key)


class LLMProviderListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for user-facing model lists.
    Excludes sensitive fields like api_key_env_var and system_prompt.
    """
    has_api_key = serializers.SerializerMethodField()
    
    class Meta:
        model = LLMProvider
        fields = [
            'id', 'name', 'display_name', 'description', 'icon_name',
            'provider_kind', 'provider_type', 'model_name', 'max_tokens', 'has_api_key',
            'supports_code', 'supports_document_upload', 'supports_streaming',
            'is_active', 'is_default', 'sort_order',
        ]
    
    def get_has_api_key(self, obj):
        """Check if API key is configured (DB or .env)."""
        if obj.provider_type == 'ollama':
            return True
        key = obj.get_api_key()
        return bool(key and key.strip())


class LLMProviderCreateSerializer(serializers.ModelSerializer):
    """Create/update serializer for admin."""
    class Meta:
        model = LLMProvider
        fields = [
            'name', 'display_name', 'description', 'icon_name',
            'provider_kind', 'provider_type', 'model_name', 'api_endpoint', 'api_version',
            'api_key_env_var', 'max_tokens', 'temperature', 'system_prompt',
            'input_cost_per_1m', 'cached_input_cost_per_1m', 'output_cost_per_1m',
            'extra_config', 'supports_code', 'supports_document_upload',
            'supports_streaming', 'is_active', 'is_default', 'sort_order',
        ]


# ---------------------------------------------------------------------------
#  User LLM Permission
# ---------------------------------------------------------------------------

class UserLLMPermissionSerializer(serializers.ModelSerializer):
    """Read serializer with computed quota fields."""
    provider_name = serializers.CharField(source='llm_provider.name', read_only=True)
    provider_display_name = serializers.CharField(source='llm_provider.display_name', read_only=True)
    quota_remaining_seconds = serializers.SerializerMethodField()
    quota_total_seconds = serializers.SerializerMethodField()

    class Meta:
        model = UserLLMPermission
        fields = [
            'id', 'llm_provider', 'provider_name', 'provider_display_name',
            'quota_minutes', 'used_seconds', 'quota_remaining_seconds',
            'quota_total_seconds', 'last_used_at', 'is_active', 'expires_at',
            'granted_at',
        ]
        read_only_fields = ['granted_at', 'used_seconds', 'last_used_at']

    def get_quota_remaining_seconds(self, obj):
        return obj.get_remaining_seconds()

    def get_quota_total_seconds(self, obj):
        if obj.quota_minutes is None:
            return None
        return obj.quota_minutes * 60


# ---------------------------------------------------------------------------
#  Messages & Conversations
# ---------------------------------------------------------------------------

class MessageSerializer(serializers.ModelSerializer):
    llm_provider_name = serializers.CharField(
        source='llm_provider.display_name', read_only=True, default=None)

    class Meta:
        model = Message
        fields = ['id', 'role', 'content', 'token_count', 'created_at', 'llm_provider', 'llm_provider_name',
                  'pptx_url', 'pptx_theme', 'style_suggestions', 'pptx_status', 'pptx_error',
                  'export_file_url', 'export_file_type', 'export_status', 'export_error']
        read_only_fields = ['id', 'token_count', 'created_at', 'llm_provider', 'llm_provider_name']


class ConversationSerializer(serializers.ModelSerializer):
    messages = serializers.SerializerMethodField()

    def get_messages(self, obj):
        # ConversationDetailView.get_queryset prefetches only the most recent 200
        # messages into `_recent_messages` (to_attr), newest-first (for the slice
        # to pick the *last* 200, not the first 200) — precisely to bound this
        # query on long conversations. Falling back to `obj.messages.all()`
        # silently defeated that cap; reversing here restores chronological order
        # for display while keeping the cap in effect.
        recent = getattr(obj, '_recent_messages', None)
        if recent is None:
            recent = obj.messages.all()
        else:
            recent = list(reversed(recent))
        return MessageSerializer(recent, many=True).data
    message_count = serializers.IntegerField(source='messages.count', read_only=True)
    llm_provider_name = serializers.CharField(source='llm_provider.name', read_only=True,
                                               default=None)
    llm_provider_display = serializers.CharField(source='llm_provider.display_name',
                                                  read_only=True, default=None)
    llm_provider_type = serializers.CharField(source='llm_provider.provider_type',
                                               read_only=True, default=None)
    has_summary = serializers.SerializerMethodField()

    def get_has_summary(self, obj):
        try:
            return obj.summary.is_active
        except ConversationSummary.DoesNotExist:
            return False

    class Meta:
        model = Conversation
        fields = [
            'id', 'title', 'llm_provider', 'llm_provider_name',
            'llm_provider_display', 'llm_provider_type', 'chat_mode', 'created_at', 'updated_at',
            'is_active', 'messages', 'message_count', 'has_summary',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ConversationListSerializer(serializers.ModelSerializer):
    """Lightweight list — no messages included."""
    message_count = serializers.SerializerMethodField()

    def get_message_count(self, obj):
        # ConversationListView annotates this at the queryset level (a single
        # aggregated query for the whole page) to avoid one COUNT query per row;
        # fall back to the direct count for any other call site that constructs
        # this serializer from a plain (non-annotated) instance.
        annotated = getattr(obj, 'annotated_message_count', None)
        return annotated if annotated is not None else obj.messages.count()
    llm_provider_name = serializers.CharField(source='llm_provider.name', read_only=True,
                                               default=None)
    llm_provider_display = serializers.CharField(source='llm_provider.display_name',
                                                  read_only=True, default=None)
    llm_provider_type = serializers.CharField(source='llm_provider.provider_type',
                                               read_only=True, default=None)

    class Meta:
        model = Conversation
        fields = [
            'id', 'title', 'llm_provider', 'llm_provider_name',
            'llm_provider_display', 'llm_provider_type', 'chat_mode', 'created_at', 'updated_at',
            'is_active', 'message_count', 'project',
        ]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']


class SavedPromptSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedPrompt
        fields = ['id', 'text', 'created_at']
        read_only_fields = ['id', 'created_at']


class ConversationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, default='New Chat')
    llm_provider = serializers.IntegerField(required=False, help_text='LLMProvider ID')
    project = serializers.IntegerField(required=False, allow_null=True, help_text='Project ID')
    chat_mode = serializers.ChoiceField(
        choices=['general', 'code', 'summarize', 'document', 'presentation'],
        required=False,
        default='general',
    )


class ChatRequestSerializer(serializers.Serializer):
    """Validates incoming chat messages."""
    message = serializers.CharField()
    conversation_id = serializers.IntegerField(required=False)
    project_id = serializers.IntegerField(required=False, help_text='Project to file a new conversation under')
    llm_provider = serializers.CharField(required=False, help_text='Provider name slug')
    llm_provider_id = serializers.IntegerField(required=False, help_text='Provider ID')
    chat_mode = serializers.ChoiceField(
        choices=['general', 'code', 'summarize', 'document', 'presentation'],
        required=False,
        default='general',
    )
    document_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
    )
    presentation_theme = serializers.CharField(required=False, allow_blank=True, default='')
    # 0 = "not specified" — the frontend always sends this key explicitly
    # even when unset, so 0 must itself pass validation (not just be a
    # bypassed-default). The view only forces an exact slide count when this
    # is truthy; max_value guards against an absurd value via raw API use.
    slide_count = serializers.IntegerField(required=False, min_value=0, max_value=30, default=0)


# ---------------------------------------------------------------------------
#  Document
# ---------------------------------------------------------------------------

class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = [
            'id', 'original_filename', 'file_type', 'file_size',
            'extraction_status', 'extraction_error', 'created_at',
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
#  Usage Log
# ---------------------------------------------------------------------------

class LLMUsageLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default=None)

    class Meta:
        model = LLMUsageLog
        fields = [
            'id', 'username', 'provider', 'model',
            'prompt_tokens', 'cached_tokens', 'completion_tokens', 'total_tokens',
            'cost_usd', 'latency_ms', 'created_at',
        ]


# ---------------------------------------------------------------------------
#  App Config
# ---------------------------------------------------------------------------

class AppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppConfig
        fields = ['id', 'key', 'value', 'value_type', 'category', 'description',
                  'is_sensitive', 'updated_at']
        read_only_fields = ['updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_sensitive:
            data['value'] = '***'
        return data


# ---------------------------------------------------------------------------
#  Document Converter
# ---------------------------------------------------------------------------

class ConversionJobSerializer(serializers.ModelSerializer):
    """Read serializer for conversion jobs."""
    output_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ConversionJob
        fields = [
            'id', 'original_filename', 'original_format', 'target_format',
            'quality', 'file_size', 'output_file_size', 'status',
            'error_message', 'output_url', 'created_at', 'completed_at',
        ]
        read_only_fields = fields
    
    def get_output_url(self, obj):
        if obj.output_file and obj.status == 'completed':
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(f'/api/admin/converter/{obj.id}/download/')
            return f'/api/admin/converter/{obj.id}/download/'
        return None

