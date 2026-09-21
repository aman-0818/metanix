export type MessageRole = 'system' | 'user' | 'assistant';
export type ChatMode = 'general' | 'code' | 'summarize' | 'document' | 'knowledge' | 'presentation';
export type StreamingStatus = 'idle' | 'waiting' | 'streaming' | 'complete';

export type ProviderType =
  | 'azure_openai'
  | 'azure_ai_foundry'
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'cohere'
  | 'xai'
  | 'perplexity'
  | 'together'
  | 'ollama'
  | 'huggingface'
  | 'custom';

export type ExportFileType = 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'csv' | 'md';

export interface Message {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  token_count?: number;
  pptx_url?: string;
  style_suggestions?: string[];
  pptx_theme?: string;
  /** 'processing' while the async PPTX render is in flight, 'failed' if it errored — drives the
   *  "Generating your presentation…" placeholder in MessageBubble until pptx_url lands. */
  pptx_status?: 'processing' | 'completed' | 'failed' | null;
  export_file_url?: string;
  export_file_type?: ExportFileType;
  /** Set locally while polling after 'done' signals an export was requested but isn't ready yet. */
  exportPending?: boolean;
  /** Real numeric backend id, learned via a short poll after streaming completes
   *  (message.id is a client-generated placeholder like "ai-<timestamp>" until then).
   *  Needed to call the explicit "Export as..." button's endpoint on a just-streamed
   *  reply. Unnecessary for messages loaded from history — their `id` is already numeric. */
  realMessageId?: number;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  llm_provider?: string;
  llm_provider_name?: string;
  llm_provider_display?: string;
  llm_provider_type?: ProviderType | null;
  chat_mode?: ChatMode;
  created_at: string;
  updated_at: string;
  message_count?: number;
  is_active?: boolean;
  project?: number | null;
}

export interface Project {
  id: number;
  name: string;
  created_at: string;
}

export interface SavedPrompt {
  id: number;
  text: string;
  created_at: string;
}

export interface LLMProvider {
  id: number;
  name: string;
  display_name: string;
  description: string;
  icon_name: string;
  provider_type: ProviderType;
  model_name: string;
  is_active: boolean;
  max_tokens: number;
  supports_code: boolean;
  supports_document_upload: boolean;
  supports_streaming: boolean;
  sort_order: number;
  is_default: boolean;
  /** 'chat' (default, existing chat-model list) or 'image' (single provider used only by Presentation-mode slide illustrations). */
  provider_kind?: 'chat' | 'image';
  has_api_key?: boolean;
  api_key_source?: 'db' | 'env' | 'none' | 'ollama';
  api_key_preview?: string;
  // Admin-only fields (may not be present for regular users)
  api_endpoint?: string;
  api_version?: string;
  api_key_env_var?: string;
  temperature?: number;
  system_prompt?: string;
  extra_config?: Record<string, unknown>;
  input_cost_per_1m?: number;
  cached_input_cost_per_1m?: number;
  output_cost_per_1m?: number;
}

export interface ApiKeyProviderStatus {
  id: number;
  name: string;
  display_name: string;
  provider_type: ProviderType;
  model_name: string;
  api_key_source: 'db' | 'env' | 'none' | 'ollama';
  api_key_env_var: string;
  has_api_key: boolean;
  api_key_preview: string;
  is_active: boolean;
}

export interface UploadedDocument {
  id: number;
  original_filename: string;
  file_type: string;
  file_size: number;
  extraction_status: 'pending' | 'processing' | 'completed' | 'failed';
  extraction_error?: string;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'user' | 'admin';
  ad_id?: string | null;
  is_active: boolean;
  date_joined?: string;
  avatar_url?: string;
  // Quota info
  model_quotas?: Array<{
    provider_id: number;
    provider_name: string;
    provider_display_name: string;
    quota_minutes: number | null;
    used_seconds: number;
    remaining_seconds: number | null;
    is_active: boolean;
  }>;
  // Session info
  session_quota_minutes?: number | null;
  session_used_seconds?: number;
  session_remaining_seconds?: number | null;
  session_started_at?: string | null;
  // Feature flags
  has_document_converter?: boolean;
}

export interface ChatResponse {
  response: string;
  conversation_id: number;
  message_id?: number;
  token_count: number;
  summarized: boolean;
  quota_remaining_seconds?: number | null;
  pptx_url?: string | null;
  style_suggestions?: string[] | null;
  pptx_theme?: string | null;
  pptx_status?: 'processing' | 'completed' | 'failed' | null;
}

export interface SessionInfo {
  quota_minutes: number | null;
  used_seconds: number;
  remaining_seconds: number | null;
  session_started_at: string | null;
  is_active: boolean;
}

export interface DashboardStats {
  total_users: number;
  total_admins: number;
  active_users: number;
  total_conversations: number;
  total_messages: number;
  active_providers: number;
  recent_users: Array<{
    id: number;
    username: string;
    email: string;
    date_joined: string;
  }>;
}

// Document Converter Types
export interface ConversionJob {
  id: number;
  original_filename: string;
  original_format: string;
  target_format: string;
  quality: string;
  file_size: number;
  output_file_size: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string;
  output_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ConverterFormats {
  max_upload_size_mb?: number;
  input_formats: Record<string, string>;
  output_formats: {
    documents: Record<string, string>;
    spreadsheets: Record<string, string>;
    presentations: Record<string, string>;
    images: Record<string, string>;
  };
  quality_presets: Record<string, {
    description: string;
    dpi: number;
    image_quality: number;
  }>;
}

export interface ConverterOutputs {
  input_format: string;
  category: string;
  available_outputs: Record<string, string>;
}
