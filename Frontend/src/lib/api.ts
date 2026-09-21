import type {
  ChatMode,
  ChatResponse,
  LLMProvider,
  ProviderType,
  ApiKeyProviderStatus,
  UploadedDocument,
  SessionInfo,
  DashboardStats,
  ConversionJob,
  ConverterFormats,
  ConverterOutputs,
  Project,
  SavedPrompt,
  ExportFileType,
} from '@/types/chat';

// ---------------------------------------------------------------------------
// Base URL helper
// ---------------------------------------------------------------------------
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // Local dev: hit Django directly
    if (origin.includes('localhost')) return 'http://localhost:8000/api';
    // Production / nginx: API is on the same origin (nginx proxies /api/ → backend)
    return `${origin}/api`;
  }
  return 'http://localhost:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Client-side upload size guard — mirrors backend MAX_UPLOAD_SIZE_MB default (multimodel/settings.py).
export const MAX_UPLOAD_SIZE_MB = 25;

// ---------------------------------------------------------------------------
// ApiService
// ---------------------------------------------------------------------------
class ApiService {
  async multipart<T>(endpoint: string, body: FormData, method = 'POST'): Promise<T> {
    const response = await this.authFetch(`${API_BASE_URL}${endpoint}`, { method, body });
    if (response.status === 413) throw new Error('Upload exceeds the server request limit. Use fewer or smaller files.');
    const data = await response.json().catch(() => { throw new Error(`Upload failed (${response.status}). Please try again.`); });
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data));
    return data as T;
  }
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private logoutCallback: (() => void) | null = null;
  private refreshTokenUpdateCallback: ((token: string) => void) | null = null;

  setLogoutCallback(cb: () => void) {
    this.logoutCallback = cb;
  }

  /** Called whenever tryRefresh() receives a rotated refresh token, so the
   * persisted store (useAuthStore) can stay in sync — SIMPLE_JWT's
   * ROTATE_REFRESH_TOKENS=True blacklists the old refresh token as soon as
   * it's used, so holding onto a stale one breaks the *next* refresh. */
  setRefreshTokenUpdateCallback(cb: (token: string) => void) {
    this.refreshTokenUpdateCallback = cb;
  }

  setToken(token: string) {
    this.token = token;
  }
  getToken() {
    return this.token;
  }
  setRefreshToken(token: string) {
    this.refreshToken = token;
  }

  private getHeaders(includeContentType = true): Record<string, string> {
    const h: Record<string, string> = {};
    if (includeContentType) h['Content-Type'] = 'application/json';
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Try to refresh the access token. */
  private async tryRefresh(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL.replace('/api', '')}/api/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: this.refreshToken }),
        });
        if (!res.ok) throw new Error('Refresh failed');
        const data = await res.json();
        this.token = data.access;
        if (data.refresh) {
          this.refreshToken = data.refresh;
          this.refreshTokenUpdateCallback?.(data.refresh);
        }
        return data.access as string;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  /**
   * Fetch with the current auth token attached; on a 401 it refreshes the access
   * token once and retries the same request. Every call site that hits the API
   * (JSON requests, SSE streaming, multipart uploads, authed downloads) should
   * route through this so an expired access token never strands the user.
   */
  async authFetch(url: string, options: RequestInit = {}, retried = false): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(url, { ...options, headers });

    // Auto-refresh on 401
    if (response.status === 401 && this.refreshToken && !retried) {
      try {
        await this.tryRefresh();
        return this.authFetch(url, options, true);
      } catch {
        // Refresh token expired — force logout so user isn't stuck in a broken state
        this.logoutCallback?.();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await this.authFetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options.headers },
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data?.error) throw new Error(data.error);
        if (data?.detail) throw new Error(data.detail);
        // DRF serializer validation errors come as {"non_field_errors": [...]}
        if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length) {
          throw new Error(data.non_field_errors[0]);
        }
        // DRF field-level errors: {"field": ["msg"]}
        const firstKey = Object.keys(data)[0];
        if (firstKey && Array.isArray(data[firstKey]) && data[firstKey].length) {
          throw new Error(data[firstKey][0]);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== text) throw e;
      }
      throw new Error(`API Error: ${response.status} - ${text}`);
    }

    if (response.status === 204) return {} as T;
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) return response.json();
    const txt = await response.text();
    return txt ? (JSON.parse(txt) as T) : ({} as T);
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  async login(username: string, password: string) {
    const res = await this.request<{
      access: string;
      refresh: string;
      user: any;
      session: SessionInfo;
    }>('/accounts/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(res.access);
    this.setRefreshToken(res.refresh);
    return res;
  }

  async getAzureAuthorizeUrl(state: string, codeChallenge: string, nonce: string) {
    const p = new URLSearchParams({
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return this.request<{ authorize_url: string; state: string }>(
      `/accounts/azure/authorize/?${p.toString()}`
    );
  }

  async exchangeAzureCode(code: string, codeVerifier: string, nonce?: string) {
    const res = await this.request<{
      access: string;
      refresh: string;
      user: any;
      session: SessionInfo;
    }>('/accounts/azure/token/', {
      method: 'POST',
      body: JSON.stringify({ code, code_verifier: codeVerifier, nonce }),
    });
    this.setToken(res.access);
    this.setRefreshToken(res.refresh);
    return res;
  }

  async getAzureLogoutUrl() {
    return this.request<{ logout_url: string }>('/accounts/azure/logout/');
  }

  async getSessionStatus() {
    return this.request<SessionInfo>('/accounts/session/');
  }

  async getCurrentUser() {
    return this.request<any>('/accounts/me/');
  }

  async getUserUsage() {
    // days=3650 — the cap/used totals on the user record are lifetime, so pull
    // the per-model breakdown over an effectively-unbounded window to match.
    return this.request<{
      totals: { total_tokens: number | null; total_cost: number | null };
      by_model: Array<{ model: string; total_tokens: number; total_cost: number }>;
    }>('/accounts/usage/me/?days=3650');
  }

  async stopSession() {
    return this.request<{ message: string; session: SessionInfo }>(
      '/accounts/logout/',
      { method: 'POST', body: JSON.stringify({ refresh: this.refreshToken }) }
    );
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------
  async sendChatMessage(
    message: string,
    opts: {
      conversationId?: number;
      projectId?: number;
      llmProviderId?: number;
      llmProvider?: string;
      chatMode?: ChatMode;
      documentIds?: number[];
      presentationTheme?: string;
      slideCount?: number;
    } = {},
    signal?: AbortSignal
  ) {
    const payload: Record<string, unknown> = { message };
    if (opts.conversationId) payload.conversation_id = opts.conversationId;
    if (opts.projectId) payload.project_id = opts.projectId;
    if (opts.llmProviderId) payload.llm_provider_id = opts.llmProviderId;
    if (opts.llmProvider) payload.llm_provider = opts.llmProvider;
    if (opts.chatMode) payload.chat_mode = opts.chatMode;
    if (opts.documentIds?.length) payload.document_ids = opts.documentIds;
    if (opts.presentationTheme !== undefined) payload.presentation_theme = opts.presentationTheme;
    if (opts.slideCount !== undefined) payload.slide_count = opts.slideCount;

    return this.request<ChatResponse>('/admin/chat/', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  }

  async retheme(messageId: number, theme: string): Promise<{ pptx_url: string; pptx_theme: string }> {
    return this.request('/admin/chat/retheme/', {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId, theme }),
    });
  }

  /** Stream a chat response via SSE. Calls onToken for each chunk, onDone when complete. */
  async streamChatMessage(
    message: string,
    opts: {
      conversationId?: number;
      projectId?: number;
      llmProviderId?: number;
      llmProvider?: string;
      chatMode?: ChatMode;
      documentIds?: number[];
    } = {},
    callbacks: {
      onToken: (token: string) => void;
      onDone: (data: { conversation_id: number; title?: string; token_count: number; export_format?: ExportFileType | null }) => void;
      onError: (error: string) => void;
      onSearch?: (searching: boolean, error?: string) => void;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const payload: Record<string, unknown> = { message };
    if (opts.conversationId) payload.conversation_id = opts.conversationId;
    if (opts.projectId) payload.project_id = opts.projectId;
    if (opts.llmProviderId) payload.llm_provider_id = opts.llmProviderId;
    if (opts.llmProvider) payload.llm_provider = opts.llmProvider;
    if (opts.chatMode) payload.chat_mode = opts.chatMode;
    if (opts.documentIds?.length) payload.document_ids = opts.documentIds;

    const url = `${API_BASE_URL}/admin/chat/stream/`;
    const response = await this.authFetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        throw new Error(data.error || data.detail || `API Error: ${response.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`API Error: ${response.status}`);
        throw e;
      }
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on double newline (SSE event separator)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const eventBlock of parts) {
        if (!eventBlock.trim()) continue;
        let eventType = 'message';
        let dataStr = '';
        for (const line of eventBlock.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6);
        }
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (eventType === 'token') callbacks.onToken(data.text ?? '');
          else if (eventType === 'done') callbacks.onDone(data);
          else if (eventType === 'error') callbacks.onError(data.error ?? 'Unknown error');
          else if (eventType === 'search') callbacks.onSearch?.(true);
          else if (eventType === 'sources') callbacks.onSearch?.(false, data.error);
        } catch {
          // ignore malformed events
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------
  async getConversations() {
    return this.request<
      Array<{
        id: number;
        title: string;
        llm_provider_name: string;
        llm_provider_display: string;
        llm_provider_type: ProviderType | null;
        chat_mode: ChatMode;
        created_at: string;
        updated_at: string;
        is_active: boolean;
        message_count: number;
        project: number | null;
      }>
    >('/admin/conversations/');
  }

  async getConversation(conversationId: number) {
    return this.request<{
      id: number;
      title: string;
      llm_provider_name: string;
      llm_provider_display: string;
      chat_mode: ChatMode;
      created_at: string;
      updated_at: string;
      is_active: boolean;
      has_summary: boolean;
      messages: Array<{
        id: number;
        role: string;
        content: string;
        token_count: number;
        created_at: string;
      }>;
      message_count: number;
    }>(`/admin/conversations/${conversationId}/`);
  }

  async updateConversationTitle(conversationId: number, title: string) {
    return this.request(`/admin/conversations/${conversationId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(conversationId: number) {
    return this.request(`/admin/conversations/${conversationId}/`, {
      method: 'DELETE',
    });
  }

  // -------------------------------------------------------------------------
  // Projects & Saved Prompts (sidebar organization)
  // -------------------------------------------------------------------------
  async getProjects() {
    return this.request<Project[]>('/admin/projects/');
  }

  async createProject(name: string) {
    return this.request<Project>('/admin/projects/', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteProject(projectId: number) {
    return this.request(`/admin/projects/${projectId}/`, { method: 'DELETE' });
  }

  async getSavedPrompts() {
    return this.request<SavedPrompt[]>('/admin/saved-prompts/');
  }

  async createSavedPrompt(text: string) {
    return this.request<SavedPrompt>('/admin/saved-prompts/', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async deleteSavedPrompt(promptId: number) {
    return this.request(`/admin/saved-prompts/${promptId}/`, { method: 'DELETE' });
  }

  // -------------------------------------------------------------------------
  // LLM Providers
  // -------------------------------------------------------------------------
  async getLLMProviders(kind: 'chat' | 'image' = 'chat', includeInactive = false) {
    const params = new URLSearchParams();
    if (kind === 'image') params.set('kind', 'image');
    if (includeInactive) params.set('include_inactive', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<LLMProvider[]>(`/admin/llm-providers/${query}`);
  }

  async createLLMProvider(payload: Partial<LLMProvider>) {
    return this.request<LLMProvider>('/admin/llm-providers/create/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateLLMProvider(id: number, payload: Partial<LLMProvider>) {
    return this.request<LLMProvider>(`/admin/llm-providers/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteLLMProvider(id: number) {
    return this.request(`/admin/llm-providers/${id}/`, { method: 'DELETE' });
  }

  // -------------------------------------------------------------------------
  // API Key Management (encrypted storage)
  // -------------------------------------------------------------------------
  async getApiKeyStatus() {
    return this.request<{
      encryption_available: boolean;
      providers: ApiKeyProviderStatus[];
    }>('/admin/api-keys/');
  }

  async setApiKey(providerId: number, apiKey: string) {
    return this.request<{ message: string; api_key_source: string; api_key_preview: string }>(
      `/admin/api-keys/${providerId}/set/`,
      { method: 'POST', body: JSON.stringify({ api_key: apiKey }) },
    );
  }

  async deleteApiKey(providerId: number) {
    return this.request<{ message: string; api_key_source: string; has_api_key: boolean }>(
      `/admin/api-keys/${providerId}/delete/`,
      { method: 'DELETE' },
    );
  }

  async verifyApiKey(providerId: number) {
    return this.request<{ status: string; message: string }>(
      `/admin/api-keys/${providerId}/verify/`,
      { method: 'POST' },
    );
  }

  async migrateApiKeysFromEnv() {
    return this.request<{
      migrated: string[];
      skipped: { name: string; reason: string }[];
      errors: { name: string; error: string }[];
      message: string;
    }>('/admin/api-keys/migrate/', { method: 'POST' });
  }

  // -------------------------------------------------------------------------
  // User Permissions (per-model quotas)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------
  async uploadDocument(file: File, signal?: AbortSignal) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_BASE_URL}/admin/documents/upload/`;
    const response = await this.authFetch(url, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${text}`);
    }
    return response.json() as Promise<UploadedDocument>;
  }

  async getDocuments() {
    return this.request<UploadedDocument[]>('/admin/documents/');
  }

  async getDocumentStatus(id: number) {
    return this.request<UploadedDocument>(`/admin/documents/${id}/`);
  }

  /** Poll target for the inline file-export kicked off after a streamed
   * reply whose SSE 'done' event carried a non-null export_format. */
  async getConversationExportStatus(conversationId: number) {
    return this.request<{
      message_id?: number;
      export_status: '' | 'processing' | 'completed' | 'failed';
      export_file_url?: string;
      export_file_type?: ExportFileType;
      export_error?: string;
    }>(`/admin/conversations/${conversationId}/export-status/`);
  }

  /** Poll target for the async PPTX render kicked off by presentation-mode sends
   * (ChatView.post enqueues generate_pptx_task; this is keyed by message id since
   * that path already has one synchronously, unlike the streamed export poll above). */
  async getPptxStatus(messageId: number) {
    return this.request<{
      message_id: number;
      pptx_status: 'processing' | 'completed' | 'failed' | null;
      pptx_url?: string | null;
      pptx_theme?: string | null;
      pptx_error?: string | null;
      style_suggestions?: string[] | null;
    }>(`/admin/messages/${messageId}/pptx-status/`);
  }

  /** Explicit "Export as..." button — renders synchronously, no polling needed. */
  async exportMessage(messageId: number, fileType: ExportFileType) {
    return this.request<{
      message_id: number;
      export_status: 'completed' | 'failed';
      export_file_url?: string;
      export_file_type?: ExportFileType;
    }>(`/admin/messages/${messageId}/export/`, {
      method: 'POST',
      body: JSON.stringify({ file_type: fileType }),
    });
  }

  // -------------------------------------------------------------------------
  // Usage & Stats
  // -------------------------------------------------------------------------

  async getUsageAnalytics(params?: { days?: number; start?: string; end?: string; refresh?: boolean }) {
    const p = new URLSearchParams();
    if (params?.days) p.set('days', String(params.days));
    if (params?.start) p.set('start', params.start);
    if (params?.end) p.set('end', params.end);
    if (params?.refresh) p.set('refresh', 'true');
    const qs = p.toString() ? `?${p.toString()}` : '';
    return this.request<any>(`/admin/usage/analytics/${qs}`);
  }

  async getDashboardStats() {
    return this.request<DashboardStats>('/admin/dashboard/stats/');
  }

  // -------------------------------------------------------------------------
  // Admin — User Management
  // -------------------------------------------------------------------------
  async createLocalUser(payload: {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'user';
  }) {
    return this.request<{ message: string; user: any }>('/admin/users/local/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getUsers() {
    return this.request<
      Array<{
        id: number;
        username: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
        ad_id: string | null;
        is_active: boolean;
        date_joined: string;
        llm_permissions: string[];
        model_quotas?: Array<{
          provider_id: number;
          provider_name: string;
          provider_display_name: string;
          quota_minutes: number | null;
          used_seconds: number;
          remaining_seconds: number | null;
          is_active: boolean;
        }>;
        session_quota_minutes?: number | null;
        session_used_seconds?: number;
        session_remaining_seconds?: number | null;
        session_started_at?: string | null;
      }>
    >('/admin/users/');
  }

  async searchAdUsers(query: string) {
    return this.request<{
      results: Array<{
        ad_id: string | null;
        email: string | null;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        display_name: string | null;
        department: string | null;
        job_title: string | null;
        location: string | null;
        upn: string | null;
      }>;
    }>('/admin/users/search/', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async syncAdUser(
    identifier: string,
    role: 'admin' | 'user',
    opts: {
      llmPermissions?: string[];
      sessionQuotaMinutes?: number | null;
      costQuotaUsd?: number | null;
      modelQuotas?: Array<{
        provider_id: number;
        quota_minutes: number | null;
      }>;
      hasDocumentConverter?: boolean;
    } = {}
  ) {
    const payload: Record<string, unknown> = { ad_id: identifier, role };
    if (opts.llmPermissions?.length) payload.llm_permissions = opts.llmPermissions;
    if (opts.sessionQuotaMinutes !== undefined)
      payload.session_quota_minutes = opts.sessionQuotaMinutes;
    if (opts.costQuotaUsd !== undefined)
      payload.cost_quota_usd = opts.costQuotaUsd;
    if (opts.modelQuotas?.length) payload.model_quotas = opts.modelQuotas;
    if (opts.hasDocumentConverter !== undefined)
      payload.has_document_converter = opts.hasDocumentConverter;

    return this.request<{ message: string; user: any }>('/admin/users/sync/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateUser(
    userId: number,
    payload: {
      is_active?: boolean;
      role?: 'admin' | 'user';
      llm_permissions?: string[];
      session_quota_minutes?: number | null;
      cost_quota_usd?: number | null;
      has_document_converter?: boolean;
      model_quotas?: Array<{
        provider_id: number;
        quota_minutes: number | null;
        is_active?: boolean;
      }>;
    }
  ) {
    return this.request<{ message: string; user: any }>(`/admin/users/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteUser(userId: number) {
    return this.request<{ message: string }>(`/admin/users/${userId}/`, {
      method: 'DELETE',
    });
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------
  async getLogStats() {
    return this.request<any>('/admin/logs/stats/');
  }

  async getLLMUsageLogs(params?: {
    page?: number;
    page_size?: number;
    provider?: string;
    username?: string;
  }) {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.page_size) p.set('page_size', String(params.page_size));
    if (params?.provider) p.set('provider', params.provider);
    if (params?.username) p.set('username', params.username);
    const qs = p.toString() ? `?${p.toString()}` : '';
    return this.request<{ count: number; results: any[] }>(
      `/admin/logs/llm/${qs}`
    );
  }

  async getAdminUsageLogs(params?: {
    limit?: number;
    offset?: number;
    provider?: string;
    username?: string;
    model?: string;
    start?: string;
    end?: string;
  }) {
    const p = new URLSearchParams();
    if (params) {
      if (params.limit !== undefined) p.set('limit', String(params.limit));
      if (params.offset !== undefined) p.set('offset', String(params.offset));
      if (params.provider) p.set('provider', params.provider);
      if (params.username) p.set('username', params.username);
      if (params.model) p.set('model', params.model);
      if (params.start) p.set('start', params.start);
      if (params.end) p.set('end', params.end);
    }
    const qs = p.toString() ? `?${p.toString()}` : '';
    return this.request<{ count: number; results: any[] }>(`/admin/logs/llm/${qs}`);
  }

  // -------------------------------------------------------------------------
  // Document Converter
  // -------------------------------------------------------------------------
  async checkConverterAccess() {
    return this.request<{ has_access: boolean }>('/admin/converter/access/');
  }

  async getConverterFormats() {
    return this.request<ConverterFormats>('/admin/converter/formats/');
  }

  async getConverterOutputs(inputFormat: string) {
    return this.request<ConverterOutputs>('/admin/converter/outputs/', {
      method: 'POST',
      body: JSON.stringify({ input_format: inputFormat }),
    });
  }

  async convertDocument(file: File, targetFormat: string, quality: string = 'high', signal?: AbortSignal) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_format', targetFormat);
    formData.append('quality', quality);

    const url = `${API_BASE_URL}/admin/converter/convert/`;
    const response = await this.authFetch(url, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        throw new Error(data.error || 'Conversion failed');
      } catch {
        throw new Error(`Conversion failed: ${text}`);
      }
    }
    
    return response.json() as Promise<{ success: boolean; job: ConversionJob }>;
  }

  async getConverterHistory() {
    return this.request<{ conversions: ConversionJob[] }>('/admin/converter/history/');
  }

  async downloadConversion(jobId: number): Promise<Blob> {
    // Use the same reachable API origin as uploads/status, not an absolute
    // URL generated from the backend's internal proxy host or protocol.
    let response: Response;
    try {
      response = await this.authFetch(`${API_BASE_URL}/admin/converter/${jobId}/download/`);
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Cannot reach the download service. Refresh the page and try again.');
      throw error;
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Your session has expired. Sign in again to download.');
      if (response.status === 403) throw new Error('You do not have permission to download this file.');
      if (response.status === 404) throw new Error('The converted file is unavailable. Refresh conversion history or convert the file again.');
      throw new Error(`The download service returned an error (${response.status}). Please try again.`);
    }
    if (response.headers.get('content-type')?.includes('text/html') &&
        !response.headers.get('content-disposition')?.includes('attachment')) {
      throw new Error('The download address returned a webpage instead of a file. Check the API connection.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The converted file is empty. Please convert it again.');
    return blob;
  }

  async deleteConversion(jobId: number) {
    return this.request<{ success: boolean }>(`/admin/converter/${jobId}/`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();
