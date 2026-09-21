import { Brand } from '@/components/Brand';
import { KnowledgeManager } from '@/components/admin/KnowledgeManager';
import { ProviderContextSettings } from '@/components/admin/ProviderContextSettings';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/hooks/useAuthStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { apiService } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  UserPlus, Users, Settings, CheckCircle, Check, X, Search,
  Trash2, Edit2, Key, Shield,
  RefreshCw, Eye, EyeOff, Upload, AlertTriangle,
  DollarSign, Clock, FileText, Info, ArrowLeft, Lock, XCircle, Image, Star, HardDrive, Download,
} from 'lucide-react';
import { LogsViewer } from '../admin/LogsViewer';
import { UsageAnalytics } from '../admin/UsageAnalytics';
import { StatCard } from '../admin/StatCard';
import { AlertBanner } from '../admin/AlertBanner';
import { ModelQuotaBar } from '../chat/ModelQuotaBar';
import { getProviderVisual } from '@/lib/providerVisuals';
import type { LLMProvider, ProviderType, ApiKeyProviderStatus } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserRow {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  ad_id: string | null;
  is_active: boolean;
  date_joined: string;
  llm_permissions: string[];
  model_quotas?: ModelQuota[];
  session_quota_minutes?: number | null;
  session_used_seconds?: number;
  session_remaining_seconds?: number | null;
  session_started_at?: string | null;
  cost_quota_usd?: string | null;
  cost_used_usd?: string;
  has_document_converter?: boolean;
}

interface ModelQuota {
  provider_id: number;
  provider_name: string;
  provider_display_name: string;
  quota_minutes: number | null;
  used_seconds: number;
  remaining_seconds: number | null;
  is_active: boolean;
}

interface AdUser {
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'azure_ai_foundry', label: 'Azure AI Foundry' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'groq', label: 'Groq' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'together', label: 'Together AI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'huggingface', label: 'HuggingFace' },
  { value: 'custom', label: 'Custom / OpenAI-compatible' },
];

const PROVIDER_KEY_HINTS: Record<string, string> = {
  azure_openai: 'AZURE_OPENAI_API_KEY',
  azure_ai_foundry: 'AZURE_OPENAI_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  anthropic: 'CLAUDE_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  xai: 'XAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  together: 'TOGETHER_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
};

// ---------------------------------------------------------------------------
// Provider-specific form field configuration
// Each provider shows only the fields the admin actually needs to fill in.
// ---------------------------------------------------------------------------
interface ProviderFieldConfig {
  endpointLabel: string;
  endpointPlaceholder: string;
  endpointHelp?: string;
  endpointRequired: boolean;
  modelLabel: string;
  modelPlaceholder: string;
  modelHelp?: string;
  showApiVersion: boolean;
  apiVersionDefault?: string;
  showApiKey: boolean;
  quickStartSteps: string[];   // step-by-step hint for the admin
}

const PROVIDER_FIELD_CONFIGS: Record<string, ProviderFieldConfig> = {
  azure_ai_foundry: {
    endpointLabel: 'Endpoint',
    endpointPlaceholder: 'https://your-resource.cognitiveservices.azure.com/',
    endpointHelp: 'Copy from Azure AI Foundry → your model → Endpoint. Just the base URL — we auto-build the full path. Or paste the full Target URI.',
    endpointRequired: true,
    modelLabel: 'Deployment name',
    modelPlaceholder: 'gpt-5.2-chat',
    modelHelp: 'The deployment name from Azure portal (same as model name in most cases).',
    showApiVersion: true,
    apiVersionDefault: '2024-12-01-preview',
    showApiKey: true,
    quickStartSteps: [
      'Go to Azure AI Foundry portal → your model deployment',
      'Copy the Endpoint URL (base URL)',
      'Copy the Deployment name',
      'Copy the API key (Key 1 or Key 2)',
      'Copy the API version',
    ],
  },
  azure_openai: {
    endpointLabel: 'Endpoint',
    endpointPlaceholder: 'https://your-resource.openai.azure.com/',
    endpointHelp: 'Azure OpenAI resource endpoint URL.',
    endpointRequired: true,
    modelLabel: 'Deployment name',
    modelPlaceholder: 'gpt-4o',
    modelHelp: 'Your Azure OpenAI deployment name.',
    showApiVersion: true,
    apiVersionDefault: '2024-06-01',
    showApiKey: true,
    quickStartSteps: [
      'Go to Azure Portal → Azure OpenAI → your resource',
      'Copy the Endpoint from Keys and Endpoint',
      'Copy the Deployment name from Model Deployments',
      'Copy Key 1 or Key 2',
    ],
  },
  openai: {
    endpointLabel: 'API base URL',
    endpointPlaceholder: 'https://api.openai.com (default if blank)',
    endpointHelp: 'Leave blank for standard OpenAI API.',
    endpointRequired: false,
    modelLabel: 'Model name',
    modelPlaceholder: 'gpt-4o',
    modelHelp: 'Model ID from OpenAI (e.g. gpt-4o, gpt-4o-mini, o1-preview).',
    showApiVersion: false,
    showApiKey: true,
    quickStartSteps: [
      'Go to platform.openai.com → API Keys',
      'Create a new secret key and paste it below',
      'Enter the model name (e.g. gpt-4o)',
    ],
  },
  anthropic: {
    endpointLabel: 'API base URL',
    endpointPlaceholder: 'https://api.anthropic.com (default if blank)',
    endpointHelp: 'Leave blank for standard Anthropic API.',
    endpointRequired: false,
    modelLabel: 'Model name',
    modelPlaceholder: 'claude-sonnet-4-5-20250929',
    modelHelp: 'Model ID from Anthropic (e.g. claude-sonnet-4-5-20250929, claude-haiku-3-5-20241022).',
    showApiVersion: false,
    showApiKey: true,
    quickStartSteps: [
      'Go to console.anthropic.com → API Keys',
      'Create a key and paste it below',
      'Enter the model name',
    ],
  },
  google: {
    endpointLabel: 'API base URL',
    endpointPlaceholder: 'https://generativelanguage.googleapis.com (default if blank)',
    endpointHelp: 'Leave blank for standard Google AI API.',
    endpointRequired: false,
    modelLabel: 'Model name',
    modelPlaceholder: 'gemini-2.5-flash',
    modelHelp: 'Model ID from Google AI Studio (e.g. gemini-2.5-flash, gemini-2.5-pro).',
    showApiVersion: false,
    showApiKey: true,
    quickStartSteps: [
      'Go to aistudio.google.com → Get API key',
      'Create or copy your API key',
      'Enter the model name (e.g. gemini-2.5-flash)',
    ],
  },
  ollama: {
    endpointLabel: 'Ollama server URL',
    endpointPlaceholder: 'http://localhost:11434 (default if blank)',
    endpointHelp: 'Leave blank for local Ollama on default port.',
    endpointRequired: false,
    modelLabel: 'Model name',
    modelPlaceholder: 'llama3.2',
    modelHelp: 'Run "ollama list" to see available models.',
    showApiVersion: false,
    showApiKey: false,
    quickStartSteps: [
      'Install Ollama and pull a model: ollama pull llama3.2',
      'Enter the model name below',
    ],
  },
  huggingface: {
    endpointLabel: 'Inference endpoint URL',
    endpointPlaceholder: 'https://router.huggingface.co (default if blank)',
    endpointHelp: 'Leave blank for HuggingFace Inference Router.',
    endpointRequired: false,
    modelLabel: 'Model ID',
    modelPlaceholder: 'meta-llama/Llama-3.1-8B-Instruct',
    modelHelp: 'Full model ID from HuggingFace (namespace/model).',
    showApiVersion: false,
    showApiKey: true,
    quickStartSteps: [
      'Go to huggingface.co → Settings → Access Tokens',
      'Create or copy your token',
      'Enter the full model ID (e.g. meta-llama/Llama-3.1-8B-Instruct)',
    ],
  },
};

// ---------------------------------------------------------------------------
// Provider visual identity (accent colors, initials, logos) now lives in
// @/lib/providerVisuals — shared with ChatSidebar and ModelSelector so all
// three surfaces stay in sync off one keyed-by-provider_type source.

// Default config for any provider not explicitly listed
const DEFAULT_FIELD_CONFIG: ProviderFieldConfig = {
  endpointLabel: 'API endpoint',
  endpointPlaceholder: 'https://api.provider.com/v1',
  endpointHelp: 'Base URL for the OpenAI-compatible API.',
  endpointRequired: false,
  modelLabel: 'Model name',
  modelPlaceholder: 'model-name',
  showApiVersion: false,
  showApiKey: true,
  quickStartSteps: [
    'Enter the API endpoint URL',
    'Enter the model name',
    'Paste your API key',
  ],
};

const formatDuration = (seconds?: number | null) => {
  if (seconds === null || seconds === undefined) return '—';
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${t % 60}s`;
};

const formatQuotaMinutes = (mins?: number | null) => {
  if (!mins || mins <= 0) return 'Unlimited';
  const d = Math.floor(mins / 1440);
  const remaining = mins % 1440;
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || 'Unlimited';
};

const parseQuotaParts = (daysStr: string, hoursStr: string, minsStr: string) => {
  const d = daysStr.trim() ? parseInt(daysStr, 10) : null;
  const h = hoursStr.trim() ? parseInt(hoursStr, 10) : null;
  const m = minsStr.trim() ? parseInt(minsStr, 10) : null;
  if ((d !== null && (isNaN(d) || d < 0)) || (h !== null && (isNaN(h) || h < 0)) || (m !== null && (isNaN(m) || m < 0)))
    return 'invalid' as const;
  if (d === null && h === null && m === null) return { totalMinutes: null };
  const total = (d || 0) * 1440 + (h || 0) * 60 + (m || 0);
  return { totalMinutes: total > 0 ? total : null };
};

const splitQuota = (mins?: number | null) => {
  if (!mins || mins <= 0) return { days: '', hours: '', minutes: '' };
  const d = Math.floor(mins / 1440);
  const remaining = mins % 1440;
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return {
    days: d > 0 ? d.toString() : '',
    hours: h > 0 ? h.toString() : '',
    minutes: m > 0 ? m.toString() : '',
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface AdminPanelProps {
  isOpen?: boolean;
  onClose: () => void;
  variant?: 'modal' | 'page';
  /** When true, renders only the tab content (no page/modal chrome, header, or own left nav) — used to host a single section inside another menu. */
  embedded?: boolean;
  /** Externally controlled section to show while embedded. */
  section?: 'users' | 'models' | 'usage' | 'security' | 'logs';
}

// Django serializes datetimes as raw ISO-8601 with microseconds (e.g.
// "2026-07-24T16:17:47.111025+00:00") — reformat those into a readable
// local timestamp before they hit a CSV cell.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
function exportUsersToCSV(filename: string, rows: UserRow[]) {
  if (rows.length === 0) return;
  const headers = ['username', 'email', 'role', 'is_active', 'date_joined'];
  const escape = (v: any) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (ISO_DATETIME_RE.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) s = d.toLocaleString();
    }
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => escape((row as any)[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminPanel({ isOpen = false, onClose, variant = 'modal', embedded = false, section }: AdminPanelProps) {
  const { user } = useAuthStore();
  const isModal = variant === 'modal';
  // Embedded mode is shown/hidden entirely by its host — always visible once mounted.
  const isVisible = embedded || !isModal || isOpen;
  const modalRef = useFocusTrap<HTMLDivElement>(isModal && !embedded && isVisible);
  useEscapeKey(isModal && !embedded && isVisible, onClose);

  // --- Shared state ---
  const [users, setUsers] = useState<UserRow[]>([]);
  const [availableLLMs, setAvailableLLMs] = useState<LLMProvider[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'models' | 'usage' | 'security' | 'logs' | 'knowledge'>(section ?? 'users');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    if (embedded && section) setActiveTab(section);
  }, [embedded, section]);

  // --- Security overview ---
  interface SecurityStats {
    sign_in_stats: { total: number; successful: number; failed: number; auth_methods: Record<string, number> };
    recent_sign_ins: { id: number; username: string; status: string; status_display: string; timestamp: string }[];
    recent_audits: { id: number; performed_by_display: string; action_display: string; action_target: string; action_target_type_display: string; timestamp: string }[];
  }
  const [securityStats, setSecurityStats] = useState<SecurityStats | null>(null);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);

  useEffect(() => {
    if (activeTab !== 'security' || securityStats || isLoadingSecurity) return;
    setIsLoadingSecurity(true);
    apiService.getLogStats()
      .then((res) => setSecurityStats(res))
      .catch((e) => console.error('Failed to load security stats:', e))
      .finally(() => setIsLoadingSecurity(false));
  }, [activeTab, securityStats, isLoadingSecurity]);

  // --- User Management (unified) ---
  const [showAddUser, setShowAddUser] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [userFilter, setUserFilter] = useState('');

  // --- Add User ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdUser[]>([]);
  const [selectedAdUser, setSelectedAdUser] = useState<AdUser | null>(null);
  const [userOnboardMode, setUserOnboardMode] = useState<'ad' | 'local'>('ad');
  const [localUsername, setLocalUsername] = useState('');
  const [localEmail, setLocalEmail] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [localCreateRole, setLocalCreateRole] = useState<'admin' | 'user'>('user');
  const [localCreateError, setLocalCreateError] = useState('');
  const [isCreatingLocalUser, setIsCreatingLocalUser] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [selectedLLMs, setSelectedLLMs] = useState<string[]>([]);
  const [newSessionQuotaDays, setNewSessionQuotaDays] = useState('');
  const [newSessionQuotaHours, setNewSessionQuotaHours] = useState('');
  const [newSessionQuotaMinutes, setNewSessionQuotaMinutes] = useState('');
  const [newCostQuota, setNewCostQuota] = useState('');
  const [newDocConverter, setNewDocConverter] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchAvailable, setIsSearchAvailable] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // --- Edit User ---
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editLLMs, setEditLLMs] = useState<string[]>([]);
  const [editSessionD, setEditSessionD] = useState('');
  const [editSessionH, setEditSessionH] = useState('');
  const [editSessionM, setEditSessionM] = useState('');
  const [editCostQuota, setEditCostQuota] = useState('');
  const [editDocConverter, setEditDocConverter] = useState(false);
  const [editModelQuotas, setEditModelQuotas] = useState<Record<number, string>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<number | null>(null);

  // --- Add LLM Provider ---
  const [llmForm, setLlmForm] = useState({
    name: '', display_name: '', model_name: '', provider_type: 'openai' as ProviderType,
    api_endpoint: '', api_version: '', api_key_env_var: '', api_key: '', max_tokens: '4096',
    temperature: '0.7', system_prompt: '', is_active: true,
    supports_code: true, supports_document_upload: false, supports_streaming: false,
    input_cost_per_1m: '0', cached_input_cost_per_1m: '0', output_cost_per_1m: '0',
  });
  const [isSavingLlm, setIsSavingLlm] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<number | null>(null);

  // --- API Key Management ---
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProviderStatus[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<number, string>>({});
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<number, boolean>>({});
  const [settingKeyFor, setSettingKeyFor] = useState<number | null>(null);
  const [verifyingKeyFor, setVerifyingKeyFor] = useState<number | null>(null);
  const [deletingKeyFor, setDeletingKeyFor] = useState<number | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // --- Model editing & filtering ---
  const [modelFilter, setModelFilter] = useState('');
  const [editingLlmId, setEditingLlmId] = useState<number | null>(null);
  const [llmEditForm, setLlmEditForm] = useState({
    display_name: '', model_name: '', api_endpoint: '', api_version: '',
    max_tokens: '4096', temperature: '0.7', system_prompt: '', is_active: true,
    supports_code: true, supports_document_upload: false,
    input_cost_per_1m: '0', cached_input_cost_per_1m: '0', output_cost_per_1m: '0',
  });
  const [isSavingLlmEdit, setIsSavingLlmEdit] = useState(false);

  // --- Image Generation Provider (Presentation-mode only; separate from the chat-model list above) ---
  // Only ever 0 or 1 of these exist, so unlike the chat-model state above this uses booleans/single
  // inputs rather than id-keyed maps — no list management needed for a single-item "the provider" concept.
  const [imageProviders, setImageProviders] = useState<LLMProvider[]>([]);
  const [isLoadingImageProviders, setIsLoadingImageProviders] = useState(false);
  const [imageProviderForm, setImageProviderForm] = useState({
    name: '', display_name: '', model_name: '', provider_type: 'azure_openai' as ProviderType,
    api_endpoint: '', api_version: '', api_key_env_var: '', api_key: '', is_active: true,
  });
  const [isSavingImageProvider, setIsSavingImageProvider] = useState(false);
  const [showAddImageProvider, setShowAddImageProvider] = useState(false);
  const [imageProviderExpanded, setImageProviderExpanded] = useState(false);
  const [isEditingImageProvider, setIsEditingImageProvider] = useState(false);
  const [imageProviderEditForm, setImageProviderEditForm] = useState({
    display_name: '', model_name: '', api_endpoint: '', api_version: '', is_active: true,
  });
  const [isSavingImageProviderEdit, setIsSavingImageProviderEdit] = useState(false);
  const [imageApiKeyInput, setImageApiKeyInput] = useState('');
  const [imageApiKeyVisible, setImageApiKeyVisible] = useState(false);
  const [isSettingImageApiKey, setIsSettingImageApiKey] = useState(false);
  const [isVerifyingImageApiKey, setIsVerifyingImageApiKey] = useState(false);
  const [isDeletingImageApiKey, setIsDeletingImageApiKey] = useState(false);

  const contentClassName = isModal
    ? 'max-h-[calc(90vh-72px)]'
    : 'h-[calc(100dvh-72px)]';

  // ----- Data loading -----
  const loadUsers = async () => {
    if (!user || user.role !== 'admin') return;
    setIsLoadingUsers(true);
    try {
      const list = await apiService.getUsers();
      setUsers(list as UserRow[]);
    } catch (e) {
      console.error('Failed to load users:', e);
    }
    setIsLoadingUsers(false);
  };

  const loadLLMs = async () => {
    try {
      // Admin panel manages disabled models too (reactivate, edit config) —
      // unlike the chat model-picker, it must not filter to active-only.
      const list = await apiService.getLLMProviders('chat', true);
      setAvailableLLMs(list);
    } catch (e) {
      console.error('Failed to load LLMs:', e);
    }
  };

  const loadApiKeyStatus = async () => {
    setIsLoadingApiKeys(true);
    try {
      const res = await apiService.getApiKeyStatus();
      setApiKeyProviders(res.providers);
      setEncryptionAvailable(res.encryption_available);
    } catch (e) {
      console.error('Failed to load API key status:', e);
    }
    setIsLoadingApiKeys(false);
  };

  const loadImageProviders = async () => {
    setIsLoadingImageProviders(true);
    try {
      const list = await apiService.getLLMProviders('image', true);
      setImageProviders(list);
    } catch (e) {
      console.error('Failed to load image providers:', e);
    }
    setIsLoadingImageProviders(false);
  };

  useEffect(() => {
    if (isVisible && user?.role === 'admin') {
      loadUsers();
      loadLLMs();
      loadApiKeyStatus();
      loadImageProviders();
    }
  }, [isVisible, user]);

  // ----- Live AD Search (debounced) -----
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2 || !isSearchAvailable) {
      if (q.length < 2) setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiService.searchAdUsers(q);
        setSearchResults(res.results || []);
        setSelectedAdUser(null);
      } catch (err: any) {
        if (err.message?.includes('501')) {
          setIsSearchAvailable(false);
          setError('User search is not configured.');
        } else {
          setError(err.message || 'Search failed');
        }
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, isSearchAvailable]);

  // ----- Add User -----
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!selectedAdUser) { setError('Select a user first'); return; }
    if (newRole === 'user' && selectedLLMs.length === 0) { setError('Select at least one LLM'); return; }

    const qp = parseQuotaParts(newSessionQuotaDays, newSessionQuotaHours, newSessionQuotaMinutes);
    if (qp === 'invalid') { setError('Invalid quota value'); return; }

    const costVal = newCostQuota.trim() ? parseFloat(newCostQuota) : null;
    if (costVal !== null && (isNaN(costVal) || costVal < 0)) { setError('Invalid cost quota'); return; }

    const id = selectedAdUser.ad_id || selectedAdUser.email || selectedAdUser.username;
    if (!id) { setError('User has no identifier'); return; }

    setIsAdding(true);
    try {
      await apiService.syncAdUser(id, newRole, {
        llmPermissions: newRole === 'user' ? selectedLLMs : undefined,
        sessionQuotaMinutes: qp.totalMinutes,
        costQuotaUsd: costVal,
        hasDocumentConverter: newDocConverter,
      });
      setSuccess('User added successfully!');
      setSearchQuery(''); setSearchResults([]); setSelectedAdUser(null);
      setNewRole('user'); setSelectedLLMs([]);
      setNewSessionQuotaDays(''); setNewSessionQuotaHours(''); setNewSessionQuotaMinutes('');
      setNewCostQuota('');
      setNewDocConverter(false);
      setShowAddUser(false);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    }
    setIsAdding(false);
  };

  // ----- Toggle User -----
  const handleToggleUser = async (u: UserRow) => {
    setError(''); setSuccess('');
    try {
      const res = await apiService.updateUser(u.id, { is_active: !u.is_active });
      setUsers(prev => prev.map(x => (x.id === res.user.id ? res.user : x)));
      setSuccess(`User ${res.user.is_active ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle user');
    }
  };

  // ----- Edit User -----
  const openUserEditor = (u: UserRow) => {
    setError(''); setSuccess('');
    setEditingUser(u);
    setExpandedUserId(u.id);
    setEditRole(u.role);
    setEditLLMs(u.llm_permissions || []);
    const { days, hours, minutes } = splitQuota(u.session_quota_minutes);
    setEditSessionD(days); setEditSessionH(hours); setEditSessionM(minutes);
    setEditCostQuota(u.cost_quota_usd ?? '');
    setEditDocConverter(u.has_document_converter ?? false);
    // Init per-model quotas
    const mq: Record<number, string> = {};
    u.model_quotas?.forEach(q => {
      mq[q.provider_id] = q.quota_minutes !== null ? q.quota_minutes.toString() : '';
    });
    setEditModelQuotas(mq);
  };

  const closeUserEditor = () => {
    setEditingUser(null);
    setExpandedUserId(null);
  };

  const handleSaveUserUpdates = async () => {
    if (!editingUser) return;
    setError(''); setSuccess(''); setIsSavingEdit(true);

    const qp = parseQuotaParts(editSessionD, editSessionH, editSessionM);
    if (qp === 'invalid') { setError('Invalid session quota'); setIsSavingEdit(false); return; }

    const costVal = editCostQuota.toString().trim() ? parseFloat(editCostQuota) : null;
    if (costVal !== null && (isNaN(costVal) || costVal < 0)) { setError('Invalid cost quota'); setIsSavingEdit(false); return; }

    // Build model_quotas payload
    const modelQuotaPayload = Object.entries(editModelQuotas)
      .filter(([, val]) => val !== undefined)
      .map(([pid, val]) => ({
        provider_id: parseInt(pid, 10),
        quota_minutes: (val as string).trim() ? parseInt(val as string, 10) : null,
      }));

    try {
      const res = await apiService.updateUser(editingUser.id, {
        role: editRole,
        llm_permissions: editRole === 'user' ? editLLMs : undefined,
        session_quota_minutes: qp.totalMinutes,
        cost_quota_usd: costVal,
        has_document_converter: editDocConverter,
        model_quotas: modelQuotaPayload.length > 0 ? modelQuotaPayload : undefined,
      });
      setUsers(prev => prev.map(x => (x.id === res.user.id ? res.user : x)));
      setSuccess('User updated');
      closeUserEditor();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    }
    setIsSavingEdit(false);
  };

  const handleDeleteUser = async (u: UserRow) => {
    if (!window.confirm(`Delete ${u.username}? This cannot be undone.`)) return;
    setIsDeletingUser(u.id);
    try {
      await apiService.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setSuccess('User deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
    setIsDeletingUser(null);
  };

  const handleCreateLocalUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLocalCreateError('');

    const username = localUsername.trim();
    const email = localEmail.trim();
    const password = localPassword.trim();

    if (!username) {
      setLocalCreateError('Username is required');
      return;
    }
    if (!email || !email.includes('@')) {
      setLocalCreateError('A valid email is required');
      return;
    }
    if (!password || password.length < 6) {
      setLocalCreateError('Password must be at least 6 characters');
      return;
    }

    setIsCreatingLocalUser(true);
    try {
      await apiService.createLocalUser({
        username,
        email,
        password,
        role: localCreateRole,
      });
      setSuccess('Local account created');
      setUserOnboardMode('ad');
      setLocalUsername('');
      setLocalEmail('');
      setLocalPassword('');
      setLocalCreateRole('user');
      setShowAddUser(false);
      loadUsers();
    } catch (err: any) {
      setLocalCreateError(err.message || 'Failed to create local user');
    }
    setIsCreatingLocalUser(false);
  };

  // ----- Create LLM Provider -----
  const handleCreateLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!llmForm.name.trim() || !llmForm.display_name.trim() || !llmForm.model_name.trim()) {
      setError('Name, display name, and model name are required'); return;
    }
    setIsSavingLlm(true);
    try {
      await apiService.createLLMProvider({
        name: llmForm.name.trim(),
        display_name: llmForm.display_name.trim(),
        model_name: llmForm.model_name.trim(),
        provider_type: llmForm.provider_type,
        api_endpoint: llmForm.api_endpoint.trim() || undefined,
        api_version: llmForm.api_version.trim() || undefined,
        api_key_env_var: llmForm.api_key_env_var.trim() || undefined,
        max_tokens: parseInt(llmForm.max_tokens, 10) || 4096,
        temperature: isNaN(parseFloat(llmForm.temperature)) ? 0.7 : parseFloat(llmForm.temperature),
        system_prompt: llmForm.system_prompt.trim() || undefined,
        is_active: llmForm.is_active,
        supports_code: llmForm.supports_code,
        supports_document_upload: llmForm.supports_document_upload,
        supports_streaming: llmForm.supports_streaming,
        input_cost_per_1m: parseFloat(llmForm.input_cost_per_1m) || 0,
        cached_input_cost_per_1m: parseFloat(llmForm.cached_input_cost_per_1m) || 0,
        output_cost_per_1m: parseFloat(llmForm.output_cost_per_1m) || 0,
      } as any);
      setSuccess('LLM provider created');
      // If API key was provided, encrypt it into DB
      if (llmForm.api_key.trim()) {
        try {
          const providers = await apiService.getLLMProviders();
          const created = providers.find((p: LLMProvider) => p.name === llmForm.name.trim());
          if (created) await apiService.setApiKey(created.id, llmForm.api_key.trim());
        } catch {
          setError('Provider created, but the API key failed to save — set it manually from the model card.');
        }
      }
      setLlmForm({
        name: '', display_name: '', model_name: '', provider_type: 'openai',
        api_endpoint: '', api_version: '', api_key_env_var: '', api_key: '', max_tokens: '4096',
        temperature: '0.7', system_prompt: '', is_active: true,
        supports_code: true, supports_document_upload: false, supports_streaming: false,
        input_cost_per_1m: '0', cached_input_cost_per_1m: '0', output_cost_per_1m: '0',
      });
      setShowAddModel(false);
      loadLLMs();
      loadApiKeyStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to create provider');
    }
    setIsSavingLlm(false);
  };

  // ----- Delete LLM Provider -----
  const handleDeleteLlm = async (id: number) => {
    if (!window.confirm('Delete this provider?')) return;
    try {
      await apiService.deleteLLMProvider(id);
      setSuccess('Provider deleted');
      if (expandedModelId === id) setExpandedModelId(null);
      loadLLMs();
      loadApiKeyStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to delete provider');
    }
  };

  // ----- API Key Handlers -----
  const handleSetApiKey = async (providerId: number) => {
    const key = apiKeyInputs[providerId]?.trim();
    if (!key) { setError('Please enter an API key'); return; }
    setError(''); setSuccess('');
    setSettingKeyFor(providerId);
    try {
      const res = await apiService.setApiKey(providerId, key);
      setSuccess(res.message);
      setApiKeyInputs(prev => ({ ...prev, [providerId]: '' }));
      loadApiKeyStatus();
      loadLLMs();
    } catch (err: any) {
      setError(err.message || 'Failed to set API key');
    }
    setSettingKeyFor(null);
  };

  const handleDeleteApiKey = async (providerId: number) => {
    setError(''); setSuccess('');
    setDeletingKeyFor(providerId);
    try {
      const res = await apiService.deleteApiKey(providerId);
      setSuccess(res.message);
      loadApiKeyStatus();
      loadLLMs();
    } catch (err: any) {
      setError(err.message || 'Failed to remove API key');
    }
    setDeletingKeyFor(null);
  };

  const handleVerifyApiKey = async (providerId: number) => {
    setError(''); setSuccess('');
    setVerifyingKeyFor(providerId);
    try {
      const res = await apiService.verifyApiKey(providerId);
      if (res.status === 'success') {
        setSuccess(res.message);
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    }
    setVerifyingKeyFor(null);
  };

  const handleMigrateKeys = async () => {
    if (!window.confirm('Migrate all existing .env API keys into encrypted DB storage?')) return;
    setError(''); setSuccess('');
    setIsMigrating(true);
    try {
      const res = await apiService.migrateApiKeysFromEnv();
      setSuccess(res.message);
      loadApiKeyStatus();
      loadLLMs();
    } catch (err: any) {
      setError(err.message || 'Migration failed');
    }
    setIsMigrating(false);
  };

  // ----- LLM Edit -----
  const openLlmEditor = (providerId: number) => {
    const llm = availableLLMs.find(l => l.id === providerId);
    if (!llm) return;
    setEditingLlmId(providerId);
    setExpandedModelId(providerId);
    setLlmEditForm({
      display_name: llm.display_name || '',
      model_name: llm.model_name || '',
      api_endpoint: llm.api_endpoint || '',
      api_version: llm.api_version || '',
      max_tokens: String(llm.max_tokens || 4096),
      temperature: String(llm.temperature ?? 0.7),
      system_prompt: llm.system_prompt || '',
      is_active: llm.is_active,
      supports_code: llm.supports_code,
      supports_document_upload: llm.supports_document_upload,
      input_cost_per_1m: String(llm.input_cost_per_1m ?? 0),
      cached_input_cost_per_1m: String(llm.cached_input_cost_per_1m ?? 0),
      output_cost_per_1m: String(llm.output_cost_per_1m ?? 0),
    });
  };

  const handleUpdateLlm = async (providerId: number) => {
    setError(''); setSuccess('');
    setIsSavingLlmEdit(true);
    try {
      await apiService.updateLLMProvider(providerId, {
        display_name: llmEditForm.display_name.trim() || undefined,
        model_name: llmEditForm.model_name.trim() || undefined,
        api_endpoint: llmEditForm.api_endpoint.trim() || undefined,
        api_version: llmEditForm.api_version.trim() || undefined,
        max_tokens: parseInt(llmEditForm.max_tokens, 10) || 4096,
        temperature: isNaN(parseFloat(llmEditForm.temperature)) ? 0.7 : parseFloat(llmEditForm.temperature),
        system_prompt: llmEditForm.system_prompt.trim() || undefined,
        is_active: llmEditForm.is_active,
        supports_code: llmEditForm.supports_code,
        supports_document_upload: llmEditForm.supports_document_upload,
        input_cost_per_1m: parseFloat(llmEditForm.input_cost_per_1m) || 0,
        cached_input_cost_per_1m: parseFloat(llmEditForm.cached_input_cost_per_1m) || 0,
        output_cost_per_1m: parseFloat(llmEditForm.output_cost_per_1m) || 0,
      } as any);
      setSuccess('Model updated successfully');
      setEditingLlmId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update model');
    } finally {
      loadLLMs();
      loadApiKeyStatus();
      setIsSavingLlmEdit(false);
    }
  };

  const handleToggleLlm = async (providerId: number, currentActive: boolean) => {
    setError(''); setSuccess('');
    try {
      await apiService.updateLLMProvider(providerId, { is_active: !currentActive } as any);
      setSuccess(`Model ${!currentActive ? 'enabled' : 'disabled'}`);
      loadLLMs();
      loadApiKeyStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle model');
    }
  };

  // Backend clears is_default off every other chat provider when this one is set —
  // only one model is ever "the" default, so no client-side bookkeeping needed here.
  const handleSetDefaultLlm = async (providerId: number) => {
    setError(''); setSuccess('');
    try {
      await apiService.updateLLMProvider(providerId, { is_default: true } as any);
      setSuccess('Default model updated');
      loadLLMs();
      loadApiKeyStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to set default model');
    }
  };

  // ----- Create Image Generation Provider -----
  const handleCreateImageProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!imageProviderForm.name.trim() || !imageProviderForm.display_name.trim() || !imageProviderForm.model_name.trim()) {
      setError('Name, display name, and model name are required'); return;
    }
    setIsSavingImageProvider(true);
    try {
      await apiService.createLLMProvider({
        name: imageProviderForm.name.trim(),
        display_name: imageProviderForm.display_name.trim(),
        model_name: imageProviderForm.model_name.trim(),
        provider_type: imageProviderForm.provider_type,
        api_endpoint: imageProviderForm.api_endpoint.trim() || undefined,
        api_version: imageProviderForm.api_version.trim() || undefined,
        api_key_env_var: imageProviderForm.api_key_env_var.trim() || undefined,
        is_active: imageProviderForm.is_active,
        provider_kind: 'image',
      } as any);
      setSuccess('Image generation provider created');
      // If API key was provided, encrypt it into DB
      if (imageProviderForm.api_key.trim()) {
        try {
          const providers = await apiService.getLLMProviders('image', true);
          const created = providers.find((p: LLMProvider) => p.name === imageProviderForm.name.trim());
          if (created) await apiService.setApiKey(created.id, imageProviderForm.api_key.trim());
        } catch {
          setError('Provider created, but the API key failed to save — set it manually from the card.');
        }
      }
      setImageProviderForm({
        name: '', display_name: '', model_name: '', provider_type: 'azure_openai',
        api_endpoint: '', api_version: '', api_key_env_var: '', api_key: '', is_active: true,
      });
      setShowAddImageProvider(false);
      loadImageProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to create image provider');
    }
    setIsSavingImageProvider(false);
  };

  // ----- Delete Image Generation Provider -----
  const handleDeleteImageProvider = async (id: number) => {
    if (!window.confirm('Delete this image generation provider?')) return;
    try {
      await apiService.deleteLLMProvider(id);
      setSuccess('Image generation provider deleted');
      setImageProviderExpanded(false);
      setIsEditingImageProvider(false);
      loadImageProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to delete image provider');
    }
  };

  const handleToggleImageProvider = async (id: number, currentActive: boolean) => {
    setError(''); setSuccess('');
    try {
      await apiService.updateLLMProvider(id, { is_active: !currentActive } as any);
      setSuccess(`Image provider ${!currentActive ? 'enabled' : 'disabled'}`);
      loadImageProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle image provider');
    }
  };

  // ----- Image Provider Edit -----
  const openImageProviderEditor = (provider: LLMProvider) => {
    setIsEditingImageProvider(true);
    setImageProviderExpanded(true);
    setImageProviderEditForm({
      display_name: provider.display_name || '',
      model_name: provider.model_name || '',
      api_endpoint: provider.api_endpoint || '',
      api_version: provider.api_version || '',
      is_active: provider.is_active,
    });
  };

  const handleUpdateImageProvider = async (providerId: number) => {
    setError(''); setSuccess('');
    setIsSavingImageProviderEdit(true);
    try {
      await apiService.updateLLMProvider(providerId, {
        display_name: imageProviderEditForm.display_name.trim() || undefined,
        model_name: imageProviderEditForm.model_name.trim() || undefined,
        api_endpoint: imageProviderEditForm.api_endpoint.trim() || undefined,
        api_version: imageProviderEditForm.api_version.trim() || undefined,
        is_active: imageProviderEditForm.is_active,
      } as any);
      setSuccess('Image provider updated successfully');
      setIsEditingImageProvider(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update image provider');
    } finally {
      loadImageProviders();
      setIsSavingImageProviderEdit(false);
    }
  };

  // ----- Image Provider API Key Handlers -----
  const handleSetImageApiKey = async (providerId: number) => {
    const key = imageApiKeyInput.trim();
    if (!key) { setError('Please enter an API key'); return; }
    setError(''); setSuccess('');
    setIsSettingImageApiKey(true);
    try {
      const res = await apiService.setApiKey(providerId, key);
      setSuccess(res.message);
      setImageApiKeyInput('');
      loadImageProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to set API key');
    }
    setIsSettingImageApiKey(false);
  };

  const handleDeleteImageApiKey = async (providerId: number) => {
    setError(''); setSuccess('');
    setIsDeletingImageApiKey(true);
    try {
      const res = await apiService.deleteApiKey(providerId);
      setSuccess(res.message);
      loadImageProviders();
    } catch (err: any) {
      setError(err.message || 'Failed to remove API key');
    }
    setIsDeletingImageApiKey(false);
  };

  const handleVerifyImageApiKey = async (providerId: number) => {
    setError(''); setSuccess('');
    setIsVerifyingImageApiKey(true);
    try {
      const res = await apiService.verifyApiKey(providerId);
      if (res.status === 'success') {
        setSuccess(res.message);
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    }
    setIsVerifyingImageApiKey(false);
  };

  // ----- Filtered & partitioned lists -----
  const filteredUsers = users.filter(u => {
    if (!userFilter) return true;
    const q = userFilter.toLowerCase();
    return u.username.toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || u.role.toLowerCase().includes(q);
  });
  const userAccounts = filteredUsers.filter(u => u.role === 'user');
  const adminAccounts = filteredUsers.filter(u => u.role === 'admin');

  if (!isVisible) return null;

  // ⚠️ Security: Only admins can access this panel. Treat superuser/staff
  // records as admins too, since the backend serializer can carry those
  // flags from the stored Django auth model even when the role string is stale.
  if (!(user?.role === 'admin' || user?.is_superuser || user?.is_staff)) {
    return null;
  }

  // ----- Reusable inline edit panel for expanded user card -----
  const renderUserEditPanel = () => {
    if (!editingUser) return null;
    return (
      <div className="p-4 sm:p-6 space-y-5">
        {/* Edit panel header */}
        <div className="flex items-center gap-2.5 pb-3 border-b border-border">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
            {editingUser.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{editingUser.username}</p>
            <p className="text-xs text-muted-foreground">{editingUser.email}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">Editing</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {/* Role */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <div className="flex gap-3">
                {(['user', 'admin'] as const).map(r => (
                  <button key={r} type="button"
                    onClick={() => { setEditRole(r); if (r === 'admin') setEditLLMs([]); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium border transition-colors ${editRole === r
                      ? r === 'admin' ? 'bg-accent/60 border-accent-foreground/30 text-accent-foreground' : 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border hover:bg-muted'
                    }`}>
                    {r === 'admin' ? <Shield className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                    {r === 'admin' ? 'Admin' : 'User'}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Quota */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Session Quota</label>
              <div className="grid grid-cols-3 gap-2">
                <div className="relative">
                  <input type="number" min="0" value={editSessionD} onChange={e => setEditSessionD(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span>
                </div>
                <div className="relative">
                  <input type="number" min="0" value={editSessionH} onChange={e => setEditSessionH(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hrs</span>
                </div>
                <div className="relative">
                  <input type="number" min="0" value={editSessionM} onChange={e => setEditSessionM(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                </div>
              </div>
              {editingUser.session_used_seconds !== undefined && editingUser.session_used_seconds > 0 && (
                <p className="text-xs text-muted-foreground">Used: {formatDuration(editingUser.session_used_seconds)}</p>
              )}
            </div>

            {/* Cost Quota */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Cost Quota (USD)</label>
              <input type="number" min="0" step="0.01" value={editCostQuota}
                onChange={e => setEditCostQuota(e.target.value)}
                placeholder="e.g. 10.00 — blank = unlimited"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              {editingUser.cost_used_usd && parseFloat(editingUser.cost_used_usd) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Spent: ${parseFloat(editingUser.cost_used_usd).toFixed(4)}
                  {editingUser.cost_quota_usd && ` / $${parseFloat(editingUser.cost_quota_usd).toFixed(2)}`}
                </p>
              )}
            </div>

            {/* Document Converter Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Document Converter</p>
                  <p className="text-xs text-muted-foreground">Convert documents between formats</p>
                </div>
              </div>
              <Switch checked={editDocConverter} onChange={() => setEditDocConverter(!editDocConverter)} />
            </div>

            {/* LLM Access */}
            {editRole === 'user' && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> Model Access</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3 bg-muted/20">
                  {availableLLMs.map(llm => (
                    <label key={llm.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
                      editLLMs.includes(llm.name) ? 'bg-primary/5 border-primary/30' : 'border-transparent hover:bg-muted/50'
                    }`}>
                      <input type="checkbox" checked={editLLMs.includes(llm.name)}
                        onChange={e => setEditLLMs(e.target.checked ? [...editLLMs, llm.name] : editLLMs.filter(n => n !== llm.name))}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0 accent-primary" />
                      <span className="text-sm">{llm.display_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — Per-model quotas */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Per-Model Quotas (minutes)</label>
            <div className="space-y-2.5 max-h-[260px] sm:max-h-[340px] overflow-y-auto border rounded-lg p-2 sm:p-3 bg-muted/20">
              {availableLLMs.map(llm => {
                const existing = editingUser.model_quotas?.find(q => q.provider_id === llm.id);
                return (
                  <div key={llm.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{llm.display_name}</span>
                      {existing && (
                        <span className="text-xs text-muted-foreground">Used: {formatDuration(existing.used_seconds)}</span>
                      )}
                    </div>
                    <input type="number" min="0"
                      value={editModelQuotas[llm.id] ?? ''}
                      onChange={e => setEditModelQuotas(prev => ({ ...prev, [llm.id]: e.target.value }))}
                      placeholder="Minutes (blank = unlimited)"
                      className="w-full px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    {existing && existing.quota_minutes !== null && (
                      <ModelQuotaBar quotaMinutes={existing.quota_minutes} usedSeconds={existing.used_seconds} remainingSeconds={existing.remaining_seconds} />
                    )}
                  </div>
                );
              })}
              {availableLLMs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No models configured. Add models in the AI Model Management tab.</p>
              )}
            </div>
          </div>
        </div>

        {/* Save / Cancel */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-border/60">
          <button onClick={closeUserEditor}
            className="px-4 py-2.5 sm:py-2 rounded-xl border text-sm hover:bg-muted transition-colors tap-target">
            Cancel
          </button>
          <button onClick={handleSaveUserUpdates} disabled={isSavingEdit}
            className="flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors tap-target">
            {isSavingEdit
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : <><CheckCircle className="w-3.5 h-3.5" /> Save Changes</>
            }
          </button>
        </div>
      </div>
    );
  };

  // =======================================================================
  // Render
  // =======================================================================
  const header = (
    <div className="flex items-center justify-between px-4 sm:px-7 py-5 border-b border-border/70 bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <Brand />
        <span className="h-6 w-px bg-border hidden sm:block" />
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">Control center</h2>
          <p className="text-xs text-muted-foreground hidden sm:block">Workspace administration</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
          {users.length} users
        </span>
        <button onClick={onClose} aria-label="Back to workspace"
          className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const nav = (
    <nav
      aria-label="Administration"
      className="w-full sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-sidebar p-2 sm:p-4 flex flex-col overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto scrollbar-mobile-hide"
    >
      <p className="hidden sm:block px-2 pt-1 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administration</p>
      <div role="tablist" aria-label="Admin sections" className="flex flex-row sm:flex-col gap-1 sm:gap-0.5" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
      }}>
        {([
          { id: 'users',  label: 'Users',  icon: Users,     color: 'text-primary' },
          { id: 'models', label: 'LLM providers', icon: Settings,  color: 'text-accent-foreground' },
          { id: 'knowledge', label: 'Company knowledge', icon: FileText, color: 'text-primary' },
          { id: 'usage',  label: 'Usage & costs',  icon: DollarSign,color: 'text-primary' },
          { id: 'security', label: 'Security & audit', icon: Lock, color: 'text-destructive' },
          { id: 'logs',   label: 'Activity logs',    icon: FileText,  color: 'text-warning' },
        ] as const).map(({ id, label, icon: Icon, color }) => (
          <button key={id}
            role="tab"
            id={`admin-tab-${id}`}
            aria-controls="admin-content"
            tabIndex={activeTab === id ? 0 : -1}
            aria-selected={activeTab === id}
            onClick={() => { setActiveTab(id); setModelFilter(''); setUserFilter(''); }}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors shrink-0 whitespace-nowrap',
              activeTab === id ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground/80 hover:bg-muted'
            )}
          >
            <Icon className={cn('w-4 h-4 shrink-0', activeTab === id && color)} />
            <span className="sm:flex-1">{label}</span>
            {id === 'users' && users.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 bg-muted text-muted-foreground">
                {users.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {!isModal && (
        <div className="hidden sm:block mt-auto pt-3">
          <button onClick={onClose}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left text-foreground/80 hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Back to workspace
          </button>
        </div>
      )}
    </nav>
  );

  const tabContent = (
    <>
      {/* Alerts */}
      {error && (
        <AlertBanner variant="error" onDismiss={() => setError('')} className="mb-5">{error}</AlertBanner>
      )}
      {success && (
        <AlertBanner variant="success" onDismiss={() => setSuccess('')} className="mb-5">{success}</AlertBanner>
      )}

      {/* ============================================================= */}
      {/* TAB: User Management (unified)                                 */}
          {/* ============================================================= */}
          {activeTab === 'knowledge' && <KnowledgeManager />}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Section heading */}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Users · {users.length}</h3>
              </div>

              {/* Summary stat cards */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
                {[
                  { label: 'Total',    value: users.length,                             iconBg: 'bg-primary/10',    icon: <Users className="w-4 h-4 text-primary" />,       val: 'text-foreground' },
                  { label: 'Active',   value: users.filter(u => u.is_active).length,    iconBg: 'bg-primary/10',icon: <CheckCircle className="w-4 h-4 text-primary" />, val: 'text-primary' },
                  { label: 'Disabled', value: users.filter(u => !u.is_active).length,   iconBg: 'bg-warning/10',  icon: <AlertTriangle className="w-4 h-4 text-warning" />,val: 'text-warning' },
                  { label: 'Admins',   value: users.filter(u => u.role === 'admin').length, iconBg: 'bg-accent/10',icon: <Shield className="w-4 h-4 text-accent-foreground" />,  val: 'text-accent-foreground', hidden: true },
                  { label: 'Users',    value: users.filter(u => u.role === 'user').length,  iconBg: 'bg-primary/10',  icon: <Users className="w-4 h-4 text-primary" />,     val: 'text-primary',   hidden: true },
                ].map(({ label, value, iconBg, icon, val, hidden }) => (
                  <StatCard key={label} label={label} value={value} icon={icon} iconBg={iconBg} valueClassName={val} hidden={hidden} />
                ))}
              </div>

              {/* ── Toolbar ─────────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={userFilter} onChange={e => setUserFilter(e.target.value)}
                    placeholder="Filter by username, email, or role…"
                    className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {userFilter && (
                    <button onClick={() => setUserFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={loadUsers} disabled={isLoadingUsers}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-60 transition-colors">
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button onClick={() => exportUsersToCSV(`users-${new Date().toISOString().slice(0, 10)}.csv`, filteredUsers)}
                    disabled={filteredUsers.length === 0}
                    title="Export users to CSV"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-60 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <button onClick={() => setShowAddUser(!showAddUser)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      showAddUser ? 'bg-muted border border-border' : 'bg-primary text-primary-foreground hover:opacity-90'
                    }`}>
                    {showAddUser ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    {showAddUser ? 'Cancel' : 'Onboard User'}
                  </button>
                </div>
              </div>

              {/* ── Visual separator above user list ─────────────────────── */}
              <div className="border-t border-border/50" />

              {/* ---- Admin Accounts Section ---- */}
              {adminAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 mb-3 px-1">
                    <div className="w-6 h-6 rounded-lg bg-accent/15 flex items-center justify-center">
                      <Shield className="w-3.5 h-3.5 text-accent-foreground" />
                    </div>
                    <h3 className="text-xs font-semibold text-accent-foreground uppercase tracking-widest">Administrators</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground font-semibold border border-accent/20">{adminAccounts.length}</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminAccounts.map(account => {
                          const isExpanded = expandedUserId === account.id && editingUser?.id === account.id;
                          return (
                            <tr key={account.id} className="hover:bg-muted/40 transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                                    {account.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <span className="font-medium truncate">{account.username}</span>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-accent/60 text-accent-foreground shrink-0">Admin</span>
                                    {account.ad_id && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary shrink-0">AD</span>}
                                    {!account.is_active && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning shrink-0">Disabled</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[220px]">{account.email || 'No email'}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{account.date_joined ? new Date(account.date_joined).toLocaleDateString() : '—'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Switch checked={account.is_active} onChange={() => handleToggleUser(account)}
                                    title={account.is_active ? 'Disable' : 'Enable'} />
                                  <button onClick={() => isExpanded ? closeUserEditor() : openUserEditor(account)}
                                    className={`p-1.5 rounded-lg border transition-colors ${isExpanded ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                                    title="Edit">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDeleteUser(account)} disabled={isDeletingUser === account.id}
                                    className="p-1.5 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive disabled:opacity-60 transition-colors"
                                    title="Delete">
                                    {isDeletingUser === account.id
                                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ---- User Accounts Section ---- */}
              <div>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="text-xs font-semibold text-primary uppercase tracking-widest">Users</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">{userAccounts.length}</span>
                </div>
                {isLoadingUsers && (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading users…</span>
                  </div>
                )}
                {userAccounts.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Models</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quota</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {userAccounts.map(account => {
                          const isExpanded = expandedUserId === account.id && editingUser?.id === account.id;
                          return (
                            <tr key={account.id} className="hover:bg-muted/40 transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-foreground font-semibold text-xs shrink-0">
                                    {account.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <span className="font-medium truncate">{account.username}</span>
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                                      account.is_active ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                                    }`}>
                                      {account.is_active ? 'Active' : 'Disabled'}
                                    </span>
                                    {account.ad_id && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary shrink-0">AD</span>}
                                    {account.has_document_converter && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-accent/60 text-accent-foreground shrink-0">
                                        <FileText className="w-3 h-3" /> Converter
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[200px]">{account.email || 'No email'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                  <Settings className="w-3 h-3" /> {account.llm_permissions?.length ?? 0} models
                                </div>
                                {account.model_quotas && account.model_quotas.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {account.model_quotas.map(mq => (
                                      <span key={mq.provider_id} className={`text-xs px-1.5 py-0.5 rounded ${
                                        mq.quota_minutes !== null && mq.remaining_seconds !== null && mq.remaining_seconds <= 0
                                          ? 'bg-destructive/10 text-destructive'
                                          : 'bg-muted text-muted-foreground'
                                      }`}>
                                        {mq.provider_display_name}: {mq.quota_minutes !== null ? formatQuotaMinutes(mq.quota_minutes) : '∞'}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatQuotaMinutes(account.session_quota_minutes)}</div>
                                {account.cost_quota_usd ? (
                                  <div className="flex items-center gap-1 mt-0.5"><DollarSign className="w-3 h-3" /> ${parseFloat(account.cost_used_usd || '0').toFixed(2)} / ${parseFloat(account.cost_quota_usd).toFixed(2)}</div>
                                ) : parseFloat(account.cost_used_usd || '0') > 0 ? (
                                  <div className="flex items-center gap-1 mt-0.5"><DollarSign className="w-3 h-3" /> ${parseFloat(account.cost_used_usd || '0').toFixed(4)} spent</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                                {account.date_joined ? new Date(account.date_joined).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Switch checked={account.is_active} onChange={() => handleToggleUser(account)}
                                    title={account.is_active ? 'Disable' : 'Enable'} />
                                  <button onClick={() => isExpanded ? closeUserEditor() : openUserEditor(account)}
                                    className={`p-1.5 rounded-lg border transition-colors ${isExpanded ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                                    title="Edit">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDeleteUser(account)} disabled={isDeletingUser === account.id}
                                    className="p-1.5 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive disabled:opacity-60 transition-colors"
                                    title="Delete">
                                    {isDeletingUser === account.id
                                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {userAccounts.length === 0 && !isLoadingUsers && !userFilter && (
                  <div className="text-center py-10 bg-muted/10 rounded-lg border border-dashed border-border">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No users onboarded yet</p>
                    <p className="text-xs text-muted-foreground">Use the <span className="font-semibold text-primary">↑ Onboard User</span> button above to add your first user.</p>
                  </div>
                )}
                {userAccounts.length === 0 && !isLoadingUsers && userFilter && (
                  <div className="text-center py-8">
                    <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No users matching &ldquo;{userFilter}&rdquo;</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* TAB: AI Model Management                                       */}
          {/* ============================================================= */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              <ProviderContextSettings providers={availableLLMs} />
              {/* Section heading */}
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Models · {apiKeyProviders.length}</h3>
                {encryptionAvailable ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary" title="API keys are encrypted (AES + HMAC) before database storage">
                    <Shield className="w-3 h-3" /> Encrypted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning" title="Add ENCRYPTION_KEY to .env to enable secure API key storage">
                    <AlertTriangle className="w-3 h-3" /> Not encrypted
                  </span>
                )}
                {encryptionAvailable && apiKeyProviders.some(p => p.api_key_source === 'env') && (
                  <button onClick={handleMigrateKeys} disabled={isMigrating}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors">
                    <Upload className="w-3 h-3" />
                    {isMigrating ? 'Migrating...' : 'Migrate .env Keys'}
                  </button>
                )}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
                {[
                  { label: 'Total',     value: apiKeyProviders.length,                                     iconBg: 'bg-primary/10',    icon: <Settings className="w-4 h-4 text-primary" /> },
                  { label: 'Ready',     value: apiKeyProviders.filter(p => p.has_api_key).length,           iconBg: 'bg-primary/10',  icon: <CheckCircle className="w-4 h-4 text-primary" />,  valueClassName: 'text-primary' },
                  { label: 'Encrypted', value: apiKeyProviders.filter(p => p.api_key_source === 'db').length,  iconBg: 'bg-primary/10',icon: <Shield className="w-4 h-4 text-primary" />,     valueClassName: 'text-primary' },
                  { label: 'Env Var',   value: apiKeyProviders.filter(p => p.api_key_source === 'env').length, iconBg: 'bg-warning/10',  icon: <FileText className="w-4 h-4 text-warning" />,     valueClassName: 'text-warning', hidden: true },
                  { label: 'No Key',    value: apiKeyProviders.filter(p => p.api_key_source === 'none').length,iconBg: 'bg-destructive/10',    icon: <AlertTriangle className="w-4 h-4 text-destructive" />,  valueClassName: 'text-destructive',   hidden: true },
                ].map(({ label, value, iconBg, icon, valueClassName, hidden }) => (
                  <StatCard key={label} label={label} value={value} icon={icon} iconBg={iconBg} valueClassName={valueClassName} hidden={hidden} />
                ))}
              </div>

              {/* Toolbar: Add Model + Filter + Refresh */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    AI Models &amp; API Keys
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={loadApiKeyStatus} disabled={isLoadingApiKeys}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-60 transition-colors">
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingApiKeys ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <button onClick={() => setShowAddModel(!showAddModel)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        showAddModel ? 'bg-muted border border-border' : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}>
                      {showAddModel ? <X className="w-3.5 h-3.5" /> : <span className="text-base leading-none">+</span>}
                      {showAddModel ? 'Cancel' : 'Add Model'}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                    placeholder="Filter models by name or type…"
                    className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {modelFilter && (
                    <button onClick={() => setModelFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ---- Add Model Form (collapsible) ---- */}
              {showAddModel && (() => {
                const fieldCfg = PROVIDER_FIELD_CONFIGS[llmForm.provider_type] || DEFAULT_FIELD_CONFIG;
                return (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto"
                  onClick={() => setShowAddModel(false)}>
                <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in p-3 sm:p-6"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-4 h-4 text-primary" />
                    <h4 className="text-base font-semibold">Add New AI Model</h4>
                  </div>
                  <form onSubmit={handleCreateLlm} className="space-y-4">

                    {/* Step 1: Choose provider */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                        Choose Provider
                      </label>
                      <select value={llmForm.provider_type} onChange={e => {
                        const pt = e.target.value as ProviderType;
                        const cfg = PROVIDER_FIELD_CONFIGS[pt] || DEFAULT_FIELD_CONFIG;
                        setLlmForm(f => ({
                          ...f,
                          provider_type: pt,
                          api_key_env_var: PROVIDER_KEY_HINTS[pt] || f.api_key_env_var,
                          api_version: cfg.apiVersionDefault || '',
                        }));
                      }}
                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        {PROVIDER_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                      </select>
                    </div>

                    {/* Quick-start guide */}
                    {fieldCfg.quickStartSteps.length > 0 && (
                      <div className="p-3 rounded-md bg-info/10 border border-info/25">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-info mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-info">Quick Setup Guide</p>
                            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                              {fieldCfg.quickStartSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Required fields from provider portal */}
                    <div className="space-y-3">
                      <label className="text-sm font-semibold flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                        Paste from Portal
                      </label>

                      {/* Endpoint */}
                      {(fieldCfg.endpointRequired || llmForm.provider_type === 'custom') && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">{fieldCfg.endpointLabel}</label>
                          <input type="text" value={llmForm.api_endpoint}
                            onChange={e => setLlmForm(f => ({ ...f, api_endpoint: e.target.value }))}
                            placeholder={fieldCfg.endpointPlaceholder}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {fieldCfg.endpointHelp && <p className="text-xs text-muted-foreground">{fieldCfg.endpointHelp}</p>}
                        </div>
                      )}

                      {/* Deployment / Model name */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{fieldCfg.modelLabel}</label>
                        <input type="text" value={llmForm.model_name}
                          onChange={e => {
                            const val = e.target.value;
                            setLlmForm(f => ({
                              ...f,
                              model_name: val,
                              // Auto-fill slug and display name if empty
                              name: f.name || val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                              display_name: f.display_name || val,
                            }));
                          }}
                          placeholder={fieldCfg.modelPlaceholder}
                          className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {fieldCfg.modelHelp && <p className="text-xs text-muted-foreground">{fieldCfg.modelHelp}</p>}
                      </div>

                      {/* API Version (Azure only) */}
                      {fieldCfg.showApiVersion && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">API Version</label>
                          <input type="text" value={llmForm.api_version}
                            onChange={e => setLlmForm(f => ({ ...f, api_version: e.target.value }))}
                            placeholder={fieldCfg.apiVersionDefault || '2024-12-01-preview'}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      )}

                      {/* API Key */}
                      {fieldCfg.showApiKey && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                            <Key className="w-3.5 h-3.5" />
                            API Key
                            {encryptionAvailable && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"><Lock className="w-3 h-3" /> Encrypted</span>}
                          </label>
                          <div className="relative">
                            <input
                              type={apiKeyVisibility[-1] ? 'text' : 'password'}
                              value={llmForm.api_key}
                              onChange={e => setLlmForm(f => ({ ...f, api_key: e.target.value }))}
                              placeholder="Paste your API key here"
                              className="w-full pl-3 pr-9 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <button type="button"
                              onClick={() => setApiKeyVisibility(prev => ({ ...prev, [-1]: !prev[-1] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {apiKeyVisibility[-1] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 3: Display info (auto-filled) */}
                    <div className="space-y-3">
                      <label className="text-sm font-semibold flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                        Display Info
                        <span className="text-xs font-normal text-muted-foreground">(auto-filled from model name)</span>
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Display name (shown to users)</label>
                          <input type="text" value={llmForm.display_name}
                            onChange={e => setLlmForm(f => ({ ...f, display_name: e.target.value }))}
                            placeholder="e.g. GPT-5.2 Chat"
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Slug name (internal ID)</label>
                          <input type="text" value={llmForm.name}
                            onChange={e => setLlmForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. gpt-5-2-chat"
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Advanced settings */}
                    <details className="group">
                      <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        Advanced Settings
                      </summary>
                      <div className="mt-3 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Endpoint for optional providers */}
                          {!fieldCfg.endpointRequired && llmForm.provider_type !== 'custom' && (
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">{fieldCfg.endpointLabel} (override)</label>
                              <input type="text" value={llmForm.api_endpoint}
                                onChange={e => setLlmForm(f => ({ ...f, api_endpoint: e.target.value }))}
                                placeholder={fieldCfg.endpointPlaceholder}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              {fieldCfg.endpointHelp && <p className="text-xs text-muted-foreground">{fieldCfg.endpointHelp}</p>}
                            </div>
                          )}
                          <Field label="Max tokens" type="number" value={llmForm.max_tokens} onChange={v => setLlmForm(f => ({ ...f, max_tokens: v }))} />
                          <Field label="Temperature" type="number" value={llmForm.temperature} onChange={v => setLlmForm(f => ({ ...f, temperature: v }))} />
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Input cost per 1M tokens ($)</label>
                            <input type="number" step="0.001" min="0" value={llmForm.input_cost_per_1m}
                              onChange={e => setLlmForm(f => ({ ...f, input_cost_per_1m: e.target.value }))}
                              placeholder="e.g. 0.15"
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Cache cost per 1M tokens ($)</label>
                            <input type="number" step="0.001" min="0" value={llmForm.cached_input_cost_per_1m}
                              onChange={e => setLlmForm(f => ({ ...f, cached_input_cost_per_1m: e.target.value }))}
                              placeholder="e.g. 0.075 — 0 if no caching"
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Output cost per 1M tokens ($)</label>
                            <input type="number" step="0.001" min="0" value={llmForm.output_cost_per_1m}
                              onChange={e => setLlmForm(f => ({ ...f, output_cost_per_1m: e.target.value }))}
                              placeholder="e.g. 0.60"
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                          </div>
                        </div>
                        {/* Env var fallback */}
                        {fieldCfg.showApiKey && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">API key env var fallback (optional)</label>
                            <input type="text" value={llmForm.api_key_env_var}
                              onChange={e => setLlmForm(f => ({ ...f, api_key_env_var: e.target.value }))}
                              placeholder={PROVIDER_KEY_HINTS[llmForm.provider_type] || 'MY_API_KEY'}
                              className="w-full px-3 py-1.5 rounded-md border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                            <p className="text-xs text-muted-foreground">
                              .env variable name as fallback if DB key is removed. Auto-filled based on provider.
                            </p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">System prompt</label>
                          <textarea value={llmForm.system_prompt} onChange={e => setLlmForm(f => ({ ...f, system_prompt: e.target.value }))}
                            rows={2} placeholder="Default system prompt for this model"
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
                        </div>
                        <div className="flex flex-wrap gap-4">
                          <Toggle label="Active" checked={llmForm.is_active} onChange={v => setLlmForm(f => ({ ...f, is_active: v }))} />
                          <Toggle label="Supports code" checked={llmForm.supports_code} onChange={v => setLlmForm(f => ({ ...f, supports_code: v }))} />
                          <Toggle label="Supports documents" checked={llmForm.supports_document_upload} onChange={v => setLlmForm(f => ({ ...f, supports_document_upload: v }))} />
                          <Toggle label="Supports streaming" checked={llmForm.supports_streaming} onChange={v => setLlmForm(f => ({ ...f, supports_streaming: v }))} />
                        </div>
                      </div>
                    </details>

                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={isSavingLlm}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
                        {isSavingLlm ? 'Creating...' : 'Create Model'}
                      </button>
                      <button type="button" onClick={() => setShowAddModel(false)}
                        className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
                </div>
                );
              })()}

              {/* ---- Existing Model Cards ---- */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {isLoadingApiKeys && <p className="text-sm text-muted-foreground col-span-full">Loading models...</p>}
                {apiKeyProviders
                  .filter(p => {
                    if (!modelFilter) return true;
                    const q = modelFilter.toLowerCase();
                    return p.display_name.toLowerCase().includes(q)
                      || p.model_name.toLowerCase().includes(q)
                      || p.provider_type.toLowerCase().includes(q);
                  })
                  .map(provider => {
                  const isExpanded = expandedModelId === provider.id;
                  const isEditing = editingLlmId === provider.id;
                  const fullLlm = availableLLMs.find(l => l.id === provider.id);
                  const providerLabel = PROVIDER_TYPES.find(pt => pt.value === provider.provider_type)?.label || provider.provider_type;
                  const fieldCfg = PROVIDER_FIELD_CONFIGS[provider.provider_type] || DEFAULT_FIELD_CONFIG;
                  const missingEndpoint = !fullLlm?.api_endpoint && ['azure_openai', 'azure_ai_foundry'].includes(provider.provider_type);
                  const providerVisual = getProviderVisual(provider.provider_type);
                  const initials = providerVisual.initials;
                  return (
                    <div
                      key={provider.id}
                      className={`bg-card rounded-lg overflow-hidden border ${missingEndpoint ? 'border-warning/30' : 'border-border'} ${isExpanded ? 'sm:col-span-2 xl:col-span-3' : ''}`}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedModelId(isExpanded && !isEditing ? null : provider.id)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          {/* Provider avatar */}
                          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-xs font-semibold text-foreground shrink-0 select-none">
                            {initials}
                          </div>
                          {/* Text info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-sm truncate">{provider.display_name}</p>
                              {missingEndpoint && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning shrink-0">No endpoint</span>
                              )}
                              {!provider.is_active && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground shrink-0">Inactive</span>
                              )}
                              {fullLlm?.is_default && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary shrink-0">
                                  <Star className="w-2.5 h-2.5 fill-current" /> Default
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono truncate">{provider.model_name}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-muted/70 text-muted-foreground shrink-0 hidden sm:inline">{providerLabel}</span>
                            </div>
                          </div>
                          {/* Key status badge */}
                          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium shrink-0 ${
                            provider.api_key_source === 'db'     ? 'bg-primary/10  text-primary  border-primary/25' :
                            provider.api_key_source === 'env'    ? 'bg-warning/10  text-warning  border-warning/25' :
                            provider.api_key_source === 'ollama' ? 'bg-accent/10 text-accent-foreground border-accent/25' :
                            'bg-destructive/10 text-destructive border-destructive/25'
                          }`}>
                            {provider.api_key_source === 'db'     ? <><Shield className="w-3 h-3" /> Encrypted</> :
                             provider.api_key_source === 'env'    ? <><FileText className="w-3 h-3" /> .env</> :
                             provider.api_key_source === 'ollama' ? <><HardDrive className="w-3 h-3" /> Local</> :
                             <><AlertTriangle className="w-3 h-3" /> No Key</>}
                          </div>
                          <span className={`text-muted-foreground text-[10px] transition-transform duration-200 ml-1 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0 pl-2 ml-1 border-l border-border">
                          {provider.is_active && !fullLlm?.is_default && (
                            <button
                              onClick={() => handleSetDefaultLlm(provider.id)}
                              className="p-1.5 rounded-lg border border-border hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                              title="Set as default model"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Switch checked={provider.is_active} onChange={() => handleToggleLlm(provider.id, provider.is_active)}
                            title={provider.is_active ? 'Disable model' : 'Enable model'} />
                          <button
                            onClick={() => isEditing ? setEditingLlmId(null) : openLlmEditor(provider.id)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isEditing ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                            }`}
                            title="Edit configuration"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ---- Edit panel (modal) ---- */}
                      {isEditing && (
                        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto"
                          onClick={() => setEditingLlmId(null)}>
                        <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in p-3 sm:p-5 space-y-4"
                          onClick={e => e.stopPropagation()}>
                          <h5 className="text-sm font-semibold flex items-center gap-1.5">
                            <Edit2 className="w-3.5 h-3.5 text-primary" /> Edit Model Configuration
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Display name</label>
                              <input type="text" value={llmEditForm.display_name}
                                onChange={e => setLlmEditForm(f => ({ ...f, display_name: e.target.value }))}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">{fieldCfg.modelLabel}</label>
                              <input type="text" value={llmEditForm.model_name}
                                onChange={e => setLlmEditForm(f => ({ ...f, model_name: e.target.value }))}
                                placeholder={fieldCfg.modelPlaceholder}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              {fieldCfg.modelHelp && <p className="text-xs text-muted-foreground">{fieldCfg.modelHelp}</p>}
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                {fieldCfg.endpointLabel}
                                {fieldCfg.endpointRequired && <span className="text-warning ml-1">*required</span>}
                              </label>
                              <input type="text" value={llmEditForm.api_endpoint}
                                onChange={e => setLlmEditForm(f => ({ ...f, api_endpoint: e.target.value }))}
                                placeholder={fieldCfg.endpointPlaceholder}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              {fieldCfg.endpointHelp && <p className="text-xs text-muted-foreground">{fieldCfg.endpointHelp}</p>}
                            </div>
                            {fieldCfg.showApiVersion && (
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">API Version</label>
                                <input type="text" value={llmEditForm.api_version}
                                  onChange={e => setLlmEditForm(f => ({ ...f, api_version: e.target.value }))}
                                  placeholder={fieldCfg.apiVersionDefault}
                                  className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              </div>
                            )}
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Max tokens</label>
                              <input type="number" value={llmEditForm.max_tokens}
                                onChange={e => setLlmEditForm(f => ({ ...f, max_tokens: e.target.value }))}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                              <input type="number" step="0.1" min="0" max="2" value={llmEditForm.temperature}
                                onChange={e => setLlmEditForm(f => ({ ...f, temperature: e.target.value }))}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Input cost per 1M tokens ($)</label>
                              <input type="number" step="0.001" min="0" value={llmEditForm.input_cost_per_1m}
                                onChange={e => setLlmEditForm(f => ({ ...f, input_cost_per_1m: e.target.value }))}
                                placeholder="e.g. 0.15"
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Cache cost per 1M tokens ($)</label>
                              <input type="number" step="0.001" min="0" value={llmEditForm.cached_input_cost_per_1m}
                                onChange={e => setLlmEditForm(f => ({ ...f, cached_input_cost_per_1m: e.target.value }))}
                                placeholder="e.g. 0.075 — 0 if no caching"
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Output cost per 1M tokens ($)</label>
                              <input type="number" step="0.001" min="0" value={llmEditForm.output_cost_per_1m}
                                onChange={e => setLlmEditForm(f => ({ ...f, output_cost_per_1m: e.target.value }))}
                                placeholder="e.g. 0.60"
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">System prompt</label>
                              <textarea value={llmEditForm.system_prompt}
                                onChange={e => setLlmEditForm(f => ({ ...f, system_prompt: e.target.value }))}
                                rows={2} placeholder="Default system prompt for this model"
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-4">
                            <Toggle label="Active" checked={llmEditForm.is_active} onChange={v => setLlmEditForm(f => ({ ...f, is_active: v }))} />
                            <Toggle label="Supports code" checked={llmEditForm.supports_code} onChange={v => setLlmEditForm(f => ({ ...f, supports_code: v }))} />
                            <Toggle label="Supports documents" checked={llmEditForm.supports_document_upload} onChange={v => setLlmEditForm(f => ({ ...f, supports_document_upload: v }))} />
                          </div>
                          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-border">
                            <button onClick={() => handleDeleteLlm(provider.id)}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-destructive/10 hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" /> Delete Model
                            </button>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditingLlmId(null)}
                                className="flex-1 sm:flex-none px-4 py-2 rounded-lg border text-sm hover:bg-muted">Cancel</button>
                              <button onClick={() => handleUpdateLlm(provider.id)} disabled={isSavingLlmEdit}
                                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
                                {isSavingLlmEdit ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        </div>
                        </div>
                      )}

                      {/* ---- Expanded detail panel ---- */}
                      {isExpanded && !isEditing && (
                        <div className="border-t border-border p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/5">
                          {/* Config info grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                            {fullLlm?.api_endpoint && (
                              <div className="col-span-2 sm:col-span-3">
                                <p className="text-muted-foreground mb-1 font-medium">Endpoint</p>
                                <code className="font-mono text-foreground break-all">{fullLlm.api_endpoint}</code>
                              </div>
                            )}
                            {fullLlm?.api_version && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">API Version</p>
                                <code className="font-mono">{fullLlm.api_version}</code>
                              </div>
                            )}
                            {provider.api_key_env_var && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">Env Var</p>
                                <code className="font-mono">{provider.api_key_env_var}</code>
                              </div>
                            )}
                            {provider.api_key_preview && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">Key Preview</p>
                                <code className="font-mono">{provider.api_key_preview}</code>
                              </div>
                            )}
                            <div className="py-1">
                              <p className="text-muted-foreground mb-1 font-medium">Max Tokens</p>
                              <span className="font-semibold">{fullLlm?.max_tokens || 4096}</span>
                            </div>
                            <div className="py-1">
                              <p className="text-muted-foreground mb-1 font-medium">Temperature</p>
                              <span className="font-semibold">{fullLlm?.temperature ?? 0.7}</span>
                            </div>
                            <div className="py-1">
                              <p className="text-muted-foreground mb-1 font-medium">Input Cost / 1M</p>
                              <span className="font-semibold text-primary">${fullLlm?.input_cost_per_1m ?? 0}</span>
                            </div>
                            <div className="py-1">
                              <p className="text-muted-foreground mb-1 font-medium">Cache Cost / 1M</p>
                              <span className="font-semibold text-primary">
                                {fullLlm?.cached_input_cost_per_1m ? `$${fullLlm.cached_input_cost_per_1m}` : 'No caching'}
                              </span>
                            </div>
                            <div className="py-1">
                              <p className="text-muted-foreground mb-1 font-medium">Output Cost / 1M</p>
                              <span className="font-semibold text-primary">${fullLlm?.output_cost_per_1m ?? 0}</span>
                            </div>
                          </div>

                          {/* Missing endpoint warning */}
                          {missingEndpoint && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30">
                              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                              <p className="text-xs text-warning flex-1">Endpoint URL is missing — this model will fail. Click Edit to configure it.</p>
                              <button onClick={() => openLlmEditor(provider.id)}
                                className="text-xs font-semibold text-warning underline shrink-0">Edit</button>
                            </div>
                          )}

                          {/* API key management */}
                          {provider.provider_type !== 'ollama' && (
                            <div className="space-y-3">
                              {encryptionAvailable && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <div className="relative flex-1">
                                    <input
                                      type={apiKeyVisibility[provider.id] ? 'text' : 'password'}
                                      value={apiKeyInputs[provider.id] || ''}
                                      onChange={e => setApiKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                                      placeholder={provider.has_api_key ? 'Enter new key to rotate...' : 'Paste API key here...'}
                                      className="w-full pl-3 pr-9 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button type="button"
                                      onClick={() => setApiKeyVisibility(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                      {apiKeyVisibility[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleSetApiKey(provider.id)}
                                    disabled={settingKeyFor === provider.id || !apiKeyInputs[provider.id]?.trim()}
                                    className="px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 whitespace-nowrap tap-target">
                                    {settingKeyFor === provider.id ? 'Saving...' : provider.api_key_source === 'db' ? 'Rotate' : 'Set Key'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                {provider.has_api_key && (
                                  <button onClick={() => handleVerifyApiKey(provider.id)}
                                    disabled={verifyingKeyFor === provider.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-60 transition-colors">
                                    {verifyingKeyFor === provider.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    {verifyingKeyFor === provider.id ? 'Testing...' : 'Verify Key'}
                                  </button>
                                )}
                                {provider.api_key_source === 'db' && (
                                  <button onClick={() => handleDeleteApiKey(provider.id)}
                                    disabled={deletingKeyFor === provider.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-warning/10 hover:text-warning disabled:opacity-60 transition-colors">
                                    <Key className="w-3.5 h-3.5" />
                                    {deletingKeyFor === provider.id ? 'Removing...' : 'Remove DB Key'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {provider.provider_type === 'ollama' && (
                            <p className="text-xs text-muted-foreground">Local model — no API key needed.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {apiKeyProviders.length === 0 && !isLoadingApiKeys && (
                  <div className="col-span-full text-center py-12 bg-muted/10 rounded-lg border border-dashed border-border">
                    <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Settings className="w-7 h-7 text-primary" />
                    </div>
                    <p className="text-base font-semibold mb-1">No AI models yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add your first model to start chatting</p>
                    <button onClick={() => setShowAddModel(true)}
                      className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                      Add Your First Model
                    </button>
                  </div>
                )}
                {modelFilter && apiKeyProviders.filter(p => {
                  const q = modelFilter.toLowerCase();
                  return p.display_name.toLowerCase().includes(q) || p.model_name.toLowerCase().includes(q) || p.provider_type.toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6 col-span-full">No models matching &ldquo;{modelFilter}&rdquo;</p>
                )}
              </div>

              {/* ── Visual separator before Image Generation section ────────── */}
              <div className="border-t border-border/50" />

              {/* ============================================================= */}
              {/* Image Generation Provider (Presentation-mode slides only)     */}
              {/* ============================================================= */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Image className="w-4 h-4 text-muted-foreground" />
                      Image Generation
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Used only by Presentation mode for image_placeholder slides</p>
                  </div>
                  {!showAddImageProvider && imageProviders.length === 0 && (
                    <button onClick={() => setShowAddImageProvider(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors shrink-0">
                      <span className="text-base leading-none">+</span> Add Image Provider
                    </button>
                  )}
                </div>

                {/* ---- Add Image Provider Form (collapsible) ---- */}
                {showAddImageProvider && (() => {
                  const fieldCfg = PROVIDER_FIELD_CONFIGS[imageProviderForm.provider_type] || DEFAULT_FIELD_CONFIG;
                  return (
                  <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto"
                    onClick={() => setShowAddImageProvider(false)}>
                  <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in p-3 sm:p-6"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-4">
                      <Image className="w-4 h-4 text-primary" />
                      <h4 className="text-base font-semibold">Add Image Generation Provider</h4>
                    </div>
                    <form onSubmit={handleCreateImageProvider} className="space-y-4">

                      {/* Step 1: Choose provider */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                          Choose Provider
                        </label>
                        <select value={imageProviderForm.provider_type} onChange={e => {
                          const pt = e.target.value as ProviderType;
                          const cfg = PROVIDER_FIELD_CONFIGS[pt] || DEFAULT_FIELD_CONFIG;
                          setImageProviderForm(f => ({
                            ...f,
                            provider_type: pt,
                            api_key_env_var: PROVIDER_KEY_HINTS[pt] || f.api_key_env_var,
                            api_version: cfg.apiVersionDefault || '',
                          }));
                        }}
                          className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {PROVIDER_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                        </select>
                      </div>

                      {/* Quick-start guide */}
                      {fieldCfg.quickStartSteps.length > 0 && (
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-primary dark:text-primary">Quick Setup Guide</p>
                              <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                                {fieldCfg.quickStartSteps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Required fields from provider portal */}
                      <div className="space-y-3">
                        <label className="text-sm font-semibold flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                          Paste from Portal
                        </label>

                        {(fieldCfg.endpointRequired || imageProviderForm.provider_type === 'custom') && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{fieldCfg.endpointLabel}</label>
                            <input type="text" value={imageProviderForm.api_endpoint}
                              onChange={e => setImageProviderForm(f => ({ ...f, api_endpoint: e.target.value }))}
                              placeholder={fieldCfg.endpointPlaceholder}
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {fieldCfg.endpointHelp && <p className="text-xs text-muted-foreground">{fieldCfg.endpointHelp}</p>}
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">{fieldCfg.modelLabel}</label>
                          <input type="text" value={imageProviderForm.model_name}
                            onChange={e => {
                              const val = e.target.value;
                              setImageProviderForm(f => ({
                                ...f,
                                model_name: val,
                                name: f.name || val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                                display_name: f.display_name || val,
                              }));
                            }}
                            placeholder={fieldCfg.modelPlaceholder}
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {fieldCfg.modelHelp && <p className="text-xs text-muted-foreground">{fieldCfg.modelHelp}</p>}
                        </div>

                        {fieldCfg.showApiVersion && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">API Version</label>
                            <input type="text" value={imageProviderForm.api_version}
                              onChange={e => setImageProviderForm(f => ({ ...f, api_version: e.target.value }))}
                              placeholder={fieldCfg.apiVersionDefault || '2024-12-01-preview'}
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        )}

                        {fieldCfg.showApiKey && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                              <Key className="w-3.5 h-3.5" />
                              API Key
                              {encryptionAvailable && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"><Lock className="w-3 h-3" /> Encrypted</span>}
                            </label>
                            <div className="relative">
                              <input
                                type={imageApiKeyVisible ? 'text' : 'password'}
                                value={imageProviderForm.api_key}
                                onChange={e => setImageProviderForm(f => ({ ...f, api_key: e.target.value }))}
                                placeholder="Paste your API key here"
                                className="w-full pl-3 pr-9 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button type="button"
                                onClick={() => setImageApiKeyVisible(v => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {imageApiKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Display info (auto-filled) */}
                      <div className="space-y-3">
                        <label className="text-sm font-semibold flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                          Display Info
                          <span className="text-xs font-normal text-muted-foreground">(auto-filled from model name)</span>
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Display name (shown in Presentation settings)</label>
                            <input type="text" value={imageProviderForm.display_name}
                              onChange={e => setImageProviderForm(f => ({ ...f, display_name: e.target.value }))}
                              placeholder="e.g. GPT-Image Slide Illustrations"
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Slug name (internal ID)</label>
                            <input type="text" value={imageProviderForm.name}
                              onChange={e => setImageProviderForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. gpt-image-1"
                              className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </div>
                      </div>

                      <Toggle label="Active" checked={imageProviderForm.is_active} onChange={v => setImageProviderForm(f => ({ ...f, is_active: v }))} />

                      <div className="flex items-center gap-2">
                        <button type="submit" disabled={isSavingImageProvider}
                          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
                          {isSavingImageProvider ? 'Creating...' : 'Create Image Provider'}
                        </button>
                        <button type="button" onClick={() => setShowAddImageProvider(false)}
                          className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                  </div>
                  );
                })()}

                {/* ---- Empty state ---- */}
                {!showAddImageProvider && imageProviders.length === 0 && !isLoadingImageProviders && (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Image className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No image generation provider configured</p>
                    <p className="text-xs text-muted-foreground mb-4">Add one to enable AI-generated slide illustrations in Presentation mode.</p>
                    <button onClick={() => setShowAddImageProvider(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors mx-auto">
                      <span className="text-base leading-none">+</span> Add Image Provider
                    </button>
                  </div>
                )}

                {/* ---- Configured provider card ---- */}
                {!showAddImageProvider && imageProviders.length > 0 && (() => {
                  const provider = imageProviders[0];
                  const isExpanded = imageProviderExpanded;
                  const isEditing = isEditingImageProvider;
                  const fieldCfg = PROVIDER_FIELD_CONFIGS[provider.provider_type] || DEFAULT_FIELD_CONFIG;
                  const providerLabel = PROVIDER_TYPES.find(pt => pt.value === provider.provider_type)?.label || provider.provider_type;
                  const missingEndpoint = !provider.api_endpoint && ['azure_openai', 'azure_ai_foundry'].includes(provider.provider_type);
                  return (
                    <div
                      className={`bg-card rounded-lg overflow-hidden border ${missingEndpoint ? 'border-warning/30' : 'border-border'}`}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
                        <button
                          type="button"
                          onClick={() => setImageProviderExpanded(isExpanded && !isEditing ? false : true)}
                          className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-left"
                        >
                          {/* Provider avatar */}
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-muted flex items-center justify-center text-xs font-semibold text-foreground shrink-0 select-none">
                            IMG
                          </div>
                          {/* Text info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-sm truncate">{provider.display_name}</p>
                              {missingEndpoint && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning shrink-0">No endpoint</span>
                              )}
                              {!provider.is_active && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground shrink-0">Inactive</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono truncate">{provider.model_name}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-muted/70 text-muted-foreground shrink-0 hidden sm:inline">{providerLabel}</span>
                            </div>
                          </div>
                          {/* Key status badge — same db/env/none treatment as chat-model cards */}
                          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium shrink-0 ${
                            provider.api_key_source === 'db'     ? 'bg-primary/10  text-primary  border-primary/25' :
                            provider.api_key_source === 'env'    ? 'bg-warning/10  text-warning  border-warning/25' :
                            provider.api_key_source === 'ollama' ? 'bg-accent/10 text-accent-foreground border-accent/25' :
                            'bg-destructive/10 text-destructive border-destructive/25'
                          }`}>
                            {provider.api_key_source === 'db'     ? <><Shield className="w-3 h-3" /> Encrypted</> :
                             provider.api_key_source === 'env'    ? <><FileText className="w-3 h-3" /> .env</> :
                             provider.api_key_source === 'ollama' ? <><HardDrive className="w-3 h-3" /> Local</> :
                             <><AlertTriangle className="w-3 h-3" /> No Key</>}
                          </div>
                          <span className={`text-muted-foreground text-[10px] transition-transform duration-200 ml-1 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0 pl-2 ml-1 border-l border-border">
                          <Switch checked={provider.is_active} onChange={() => handleToggleImageProvider(provider.id, provider.is_active)}
                            title={provider.is_active ? 'Disable provider' : 'Enable provider'} />
                          <button
                            onClick={() => isEditing ? setIsEditingImageProvider(false) : openImageProviderEditor(provider)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isEditing ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                            }`}
                            title="Edit configuration"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ---- Edit panel (modal) ---- */}
                      {isEditing && (
                        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto"
                          onClick={() => setIsEditingImageProvider(false)}>
                        <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in p-3 sm:p-5 space-y-4"
                          onClick={e => e.stopPropagation()}>
                          <h5 className="text-sm font-semibold flex items-center gap-1.5">
                            <Edit2 className="w-3.5 h-3.5 text-primary" /> Edit Image Provider Configuration
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Display name</label>
                              <input type="text" value={imageProviderEditForm.display_name}
                                onChange={e => setImageProviderEditForm(f => ({ ...f, display_name: e.target.value }))}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">{fieldCfg.modelLabel}</label>
                              <input type="text" value={imageProviderEditForm.model_name}
                                onChange={e => setImageProviderEditForm(f => ({ ...f, model_name: e.target.value }))}
                                placeholder={fieldCfg.modelPlaceholder}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              {fieldCfg.modelHelp && <p className="text-xs text-muted-foreground">{fieldCfg.modelHelp}</p>}
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                {fieldCfg.endpointLabel}
                                {fieldCfg.endpointRequired && <span className="text-warning ml-1">*required</span>}
                              </label>
                              <input type="text" value={imageProviderEditForm.api_endpoint}
                                onChange={e => setImageProviderEditForm(f => ({ ...f, api_endpoint: e.target.value }))}
                                placeholder={fieldCfg.endpointPlaceholder}
                                className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              {fieldCfg.endpointHelp && <p className="text-xs text-muted-foreground">{fieldCfg.endpointHelp}</p>}
                            </div>
                            {fieldCfg.showApiVersion && (
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">API Version</label>
                                <input type="text" value={imageProviderEditForm.api_version}
                                  onChange={e => setImageProviderEditForm(f => ({ ...f, api_version: e.target.value }))}
                                  placeholder={fieldCfg.apiVersionDefault}
                                  className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                              </div>
                            )}
                          </div>
                          <Toggle label="Active" checked={imageProviderEditForm.is_active} onChange={v => setImageProviderEditForm(f => ({ ...f, is_active: v }))} />
                          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-border">
                            <button onClick={() => handleDeleteImageProvider(provider.id)}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-destructive/10 hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" /> Delete Provider
                            </button>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setIsEditingImageProvider(false)}
                                className="flex-1 sm:flex-none px-4 py-2 rounded-lg border text-sm hover:bg-muted">Cancel</button>
                              <button onClick={() => handleUpdateImageProvider(provider.id)} disabled={isSavingImageProviderEdit}
                                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
                                {isSavingImageProviderEdit ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        </div>
                        </div>
                      )}

                      {/* ---- Expanded detail + API key panel ---- */}
                      {isExpanded && !isEditing && (
                        <div className="border-t border-border p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/5">
                          {/* Config info grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                            {provider.api_endpoint && (
                              <div className="col-span-2 sm:col-span-3">
                                <p className="text-muted-foreground mb-1 font-medium">Endpoint</p>
                                <code className="font-mono text-foreground break-all">{provider.api_endpoint}</code>
                              </div>
                            )}
                            {provider.api_version && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">API Version</p>
                                <code className="font-mono">{provider.api_version}</code>
                              </div>
                            )}
                            {provider.api_key_env_var && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">Env Var</p>
                                <code className="font-mono">{provider.api_key_env_var}</code>
                              </div>
                            )}
                            {provider.api_key_preview && (
                              <div className="py-1">
                                <p className="text-muted-foreground mb-1 font-medium">Key Preview</p>
                                <code className="font-mono">{provider.api_key_preview}</code>
                              </div>
                            )}
                          </div>

                          {/* Missing endpoint warning */}
                          {missingEndpoint && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30">
                              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                              <p className="text-xs text-warning flex-1">Endpoint URL is missing — this provider will fail. Click Edit to configure it.</p>
                              <button onClick={() => openImageProviderEditor(provider)}
                                className="text-xs font-semibold text-warning underline shrink-0">Edit</button>
                            </div>
                          )}

                          {/* API key management */}
                          {provider.provider_type !== 'ollama' && (
                            <div className="space-y-3">
                              {encryptionAvailable && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <div className="relative flex-1">
                                    <input
                                      type={imageApiKeyVisible ? 'text' : 'password'}
                                      value={imageApiKeyInput}
                                      onChange={e => setImageApiKeyInput(e.target.value)}
                                      placeholder={provider.has_api_key ? 'Enter new key to rotate...' : 'Paste API key here...'}
                                      className="w-full pl-3 pr-9 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    <button type="button"
                                      onClick={() => setImageApiKeyVisible(v => !v)}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                      {imageApiKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleSetImageApiKey(provider.id)}
                                    disabled={isSettingImageApiKey || !imageApiKeyInput.trim()}
                                    className="px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 whitespace-nowrap tap-target">
                                    {isSettingImageApiKey ? 'Saving...' : provider.api_key_source === 'db' ? 'Rotate' : 'Set Key'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                {provider.has_api_key && (
                                  <button onClick={() => handleVerifyImageApiKey(provider.id)}
                                    disabled={isVerifyingImageApiKey}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-60 transition-colors">
                                    {isVerifyingImageApiKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    {isVerifyingImageApiKey ? 'Testing...' : 'Verify Key'}
                                  </button>
                                )}
                                {provider.api_key_source === 'db' && (
                                  <button onClick={() => handleDeleteImageApiKey(provider.id)}
                                    disabled={isDeletingImageApiKey}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-warning/10 hover:text-warning disabled:opacity-60 transition-colors">
                                    <Key className="w-3.5 h-3.5" />
                                    {isDeletingImageApiKey ? 'Removing...' : 'Remove DB Key'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {provider.provider_type === 'ollama' && (
                            <p className="text-xs text-muted-foreground">Local model — no API key needed.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* TAB: Usage Analytics                                           */}
          {/* ============================================================= */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              {/* Section heading */}
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Usage Analytics</h3>
              </div>
              <UsageAnalytics />
            </div>
          )}

          {/* ============================================================= */}
          {/* TAB: Security                                                  */}
          {/* ============================================================= */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Section heading */}
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Security</h3>
              </div>

              {/* Encryption status */}
              <div>
                <h3 className="text-sm font-semibold mb-3">API Key Encryption</h3>
                {!encryptionAvailable ? (
                  <AlertBanner variant="warning" className="mb-3">
                    <strong>Encryption not configured.</strong> Add <code className="px-1 py-0.5 rounded bg-warning/20 font-mono">ENCRYPTION_KEY</code> to .env to enable secure API key storage.
                  </AlertBanner>
                ) : (
                  <AlertBanner variant="success" className="mb-3">
                    <strong>Encryption active.</strong> API keys are encrypted (AES + HMAC) before database storage.
                  </AlertBanner>
                )}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <StatCard label="Encrypted" value={apiKeyProviders.filter(p => p.api_key_source === 'db').length}
                    iconBg="bg-primary/10" icon={<Shield className="w-4 h-4 text-primary" />} valueClassName="text-primary" />
                  <StatCard label="Env Var" value={apiKeyProviders.filter(p => p.api_key_source === 'env').length}
                    iconBg="bg-warning/10" icon={<FileText className="w-4 h-4 text-warning" />} valueClassName="text-warning" />
                  <StatCard label="No Key" value={apiKeyProviders.filter(p => p.api_key_source === 'none').length}
                    iconBg="bg-destructive/10" icon={<AlertTriangle className="w-4 h-4 text-destructive" />} valueClassName="text-destructive" />
                </div>
              </div>

              {/* Sign-in security */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Sign-in Activity</h3>
                {isLoadingSecurity ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : securityStats ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                      <StatCard label="Total sign-ins" value={securityStats.sign_in_stats.total}
                        iconBg="bg-primary/10" icon={<Users className="w-4 h-4 text-primary" />} />
                      <StatCard label="Successful" value={securityStats.sign_in_stats.successful}
                        iconBg="bg-primary/10" icon={<CheckCircle className="w-4 h-4 text-primary" />} valueClassName="text-primary" />
                      <StatCard label="Failed" value={securityStats.sign_in_stats.failed}
                        iconBg="bg-destructive/10" icon={<XCircle className="w-4 h-4 text-destructive" />} valueClassName="text-destructive" />
                    </div>

                    {Object.keys(securityStats.sign_in_stats.auth_methods).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        {Object.entries(securityStats.sign_in_stats.auth_methods).map(([method, count]) => (
                          <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                            {method === 'azure_ad' ? 'Azure AD SSO' : method === 'local' ? 'Local login' : method}: {count}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent sign-ins</p>
                        <div className="rounded-xl border divide-y divide-border/60">
                          {securityStats.recent_sign_ins.length === 0 && (
                            <p className="text-xs text-muted-foreground p-3">No sign-in activity yet.</p>
                          )}
                          {securityStats.recent_sign_ins.map((log) => (
                            <div key={log.id} className="flex items-center justify-between px-3 py-2 text-xs">
                              <span className="font-medium truncate">{log.username}</span>
                              <span className={cn('inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded text-xs font-medium',
                                log.status === 'success' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
                                {log.status_display}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent admin actions</p>
                        <div className="rounded-xl border divide-y divide-border/60">
                          {securityStats.recent_audits.length === 0 && (
                            <p className="text-xs text-muted-foreground p-3">No audit activity yet.</p>
                          )}
                          {securityStats.recent_audits.map((log) => (
                            <div key={log.id} className="px-3 py-2 text-xs">
                              <p className="font-medium truncate">{log.performed_by_display} — {log.action_display}</p>
                              {log.action_target && <p className="text-muted-foreground truncate">{log.action_target}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Unable to load sign-in activity.</p>
                )}
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* TAB: Logs                                                      */}
          {/* ============================================================= */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              {/* Section heading */}
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Logs</h3>
              </div>
              <LogsViewer />
            </div>
          )}
    </>
  );

  const userEditModal = editingUser && (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto"
      onClick={closeUserEditor}>
      <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}>
        {renderUserEditPanel()}
      </div>
    </div>
  );

  const onboardModal = showAddUser && (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-3 pb-6 bg-black/40 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Onboard User</h4>
              <p className="text-xs text-muted-foreground">{userOnboardMode === 'ad' ? 'from Active Directory' : 'create local account'}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 mr-3">
            <button type="button" onClick={() => setUserOnboardMode('ad')}
              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${userOnboardMode === 'ad' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'}`}>AD Search</button>
            <button type="button" onClick={() => setUserOnboardMode('local')}
              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${userOnboardMode === 'local' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'}`}>Local</button>
          </div>
          <button
            onClick={() => { setShowAddUser(false); setSearchQuery(''); setSearchResults([]); setSelectedAdUser(null); setUserOnboardMode('ad'); setLocalUsername(''); setLocalEmail(''); setLocalPassword(''); setLocalCreateRole('user'); setLocalCreateError(''); }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {userOnboardMode === 'ad' ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <p className="text-sm font-semibold">Search Active Directory</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Name, email or username (min 2 chars)…" disabled={!isSearchAvailable}
                    className="w-full pl-9 pr-10 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {isSearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin block" />
                  )}
                </div>
                {!isSearchAvailable && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Azure AD search not available — configure AZURE_AD_GRAPH_ENABLED in .env.
                  </p>
                )}
                {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No users found for &ldquo;{searchQuery.trim()}&rdquo;</p>
                )}
                {searchResults.length > 0 && (
                  <div className="border border-border rounded-lg bg-card max-h-52 overflow-y-auto scrollbar-thin">
                    <div className="px-3 py-2 border-b bg-muted/40 sticky top-0">
                      <p className="text-xs font-medium text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — click to select</p>
                    </div>
                    <div className="divide-y divide-border">
                      {searchResults.map((r, i) => {
                        const key = r.ad_id || r.email || `t-${i}`;
                        const sel = selectedAdUser?.ad_id === r.ad_id;
                        return (
                          <button key={key} type="button" onClick={() => setSelectedAdUser(r)}
                            className={`w-full text-left px-4 py-3 transition-colors ${sel ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted/40'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate">
                                  {r.display_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.username || 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{r.email || r.upn || '—'}</p>
                                <div className="flex flex-wrap gap-x-3 mt-0.5">
                                  {r.department && <span className="text-xs text-muted-foreground">{r.department}</span>}
                                  {r.job_title && <span className="text-xs text-muted-foreground">{r.job_title}</span>}
                                </div>
                              </div>
                              {sel && <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border/50" />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${selectedAdUser ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>2</span>
                  <p className="text-sm font-semibold">Selected User</p>
                </div>
                {selectedAdUser ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {(selectedAdUser.display_name || selectedAdUser.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{selectedAdUser.display_name || selectedAdUser.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{selectedAdUser.email}</p>
                    </div>
                    <button onClick={() => setSelectedAdUser(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/70 bg-muted/20 text-xs text-muted-foreground">
                    No user selected yet — search and click a result above.
                  </div>
                )}
              </div>

              <div className="border-t border-border/50" />

              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                  <p className="text-sm font-semibold">Configure Permissions &amp; Quotas</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</label>
                    <div className="flex gap-2">
                      {(['user', 'admin'] as const).map(r => (
                        <button key={r} type="button"
                          onClick={() => { setNewRole(r); if (r === 'admin') setSelectedLLMs([]); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-semibold border transition-colors ${newRole === r
                            ? r === 'admin'
                              ? 'bg-accent/60 border-accent-foreground/30 text-accent-foreground'
                              : 'bg-primary/10 border-primary/40 text-primary'
                            : 'border-border hover:bg-muted'
                          }`}>
                          {r === 'admin' ? <Shield className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                          {r === 'admin' ? 'Admin' : 'User'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Cost Quota (USD)
                    </label>
                    <input type="number" min="0" step="0.01" value={newCostQuota} onChange={e => setNewCostQuota(e.target.value)}
                      placeholder="Blank = unlimited"
                      className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Session Quota
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: newSessionQuotaDays, set: setNewSessionQuotaDays, unit: 'days' },
                      { value: newSessionQuotaHours, set: setNewSessionQuotaHours, unit: 'hrs' },
                      { value: newSessionQuotaMinutes, set: setNewSessionQuotaMinutes, unit: 'min' },
                    ].map(({ value, set, unit }) => (
                      <div key={unit} className="relative">
                        <input type="number" min="0" value={value} onChange={e => set(e.target.value)}
                          placeholder="0" className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-10" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Leave all blank for unlimited.</p>
                </div>

                {newRole === 'user' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Settings className="w-3 h-3" /> Model Access
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto scrollbar-thin border rounded-xl p-3 bg-muted/20">
                      {availableLLMs.filter(llm => llm.has_api_key !== false).length === 0 && (
                        <p className="text-xs text-muted-foreground col-span-2">No models with API keys yet.</p>
                      )}
                      {availableLLMs.filter(llm => llm.has_api_key !== false).map(llm => (
                        <label key={llm.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                          selectedLLMs.includes(llm.name) ? 'bg-primary/8 border-primary/30' : 'border-transparent hover:bg-muted/60'
                        }`}>
                          <input type="checkbox" checked={selectedLLMs.includes(llm.name)}
                            onChange={e => setSelectedLLMs(e.target.checked ? [...selectedLLMs, llm.name] : selectedLLMs.filter(n => n !== llm.name))}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0 accent-primary" />
                          <span className="text-sm">{llm.display_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Document Converter</p>
                      <p className="text-xs text-muted-foreground">Convert documents between formats</p>
                    </div>
                  </div>
                  <Switch checked={newDocConverter} onChange={() => setNewDocConverter(!newDocConverter)} />
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button type="submit" disabled={isAdding || !selectedAdUser}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {isAdding
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Adding…</>
                      : selectedAdUser
                        ? <><CheckCircle className="w-3.5 h-3.5" /> Onboard {(selectedAdUser.display_name || selectedAdUser.username || '').split(' ')[0]}</>
                        : <><UserPlus className="w-3.5 h-3.5" /> Select a user first</>
                    }
                  </button>
                  <button type="button"
                    onClick={() => { setShowAddUser(false); setSearchQuery(''); setSearchResults([]); setSelectedAdUser(null); }}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </>
          ) : (
            <form onSubmit={handleCreateLocalUser} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <p className="text-sm font-semibold">Create Local Account</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</label>
                    <input value={localUsername} onChange={e => setLocalUsername(e.target.value)} className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="local.username" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
                    <input type="email" value={localEmail} onChange={e => setLocalEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="name@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
                    <input type="password" value={localPassword} onChange={e => setLocalPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="minimum 6 characters" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</label>
                    <div className="flex gap-2">
                      {(['user', 'admin'] as const).map(r => (
                        <button key={r} type="button" onClick={() => setLocalCreateRole(r)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-semibold border transition-colors ${localCreateRole === r ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border hover:bg-muted'}`}>{r === 'admin' ? 'Admin' : 'User'}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {localCreateError && <p className="text-xs text-destructive">{localCreateError}</p>}
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <button type="submit" disabled={isCreatingLocalUser}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {isCreatingLocalUser ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><UserPlus className="w-3.5 h-3.5" /> Create Local Account</>}
                </button>
                <button type="button" onClick={() => { setUserOnboardMode('ad'); setLocalUsername(''); setLocalEmail(''); setLocalPassword(''); setLocalCreateRole('user'); setLocalCreateError(''); }} className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">Back to AD Search</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto">
          {tabContent}
        </div>
        {onboardModal}
        {userEditModal}
      </div>
    );
  }

  return (
    <div className={isModal ? 'admin-workspace fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4' : 'admin-workspace min-h-[100dvh] w-full bg-background'}>
      <div
        ref={isModal ? modalRef : undefined}
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal ? true : undefined}
        aria-label={isModal ? 'Admin Panel' : undefined}
        tabIndex={isModal ? -1 : undefined}
        className={isModal ? 'bg-card border border-border rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden' : 'bg-background w-full min-h-[100dvh]'}
      >
        {header}
        <div className={cn('flex flex-col sm:flex-row', contentClassName)}>
          {nav}
          <div id="admin-content" role="tabpanel" aria-labelledby={`admin-tab-${activeTab}`} className="flex-1 min-w-0 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            <div className="max-w-6xl mx-auto">
              <div className="page-intro mb-8"><span className="eyebrow">METANIX / ADMINISTRATION</span><h1>{{users: 'People & permissions', knowledge: 'Company knowledge', models: 'Intelligence, configured.', usage: 'Every interaction, in view.', security: 'A workspace you can trust.', logs: 'The full picture.'}[activeTab]}</h1><p>{{users: 'Manage access, individual quotas, and the tools your team can use.', knowledge: 'Upload policies, manage access, and track document indexing.', models: 'Connect and manage the models that power your workspace.', usage: 'Understand adoption, token usage, and costs from your workspace activity.', security: 'Review authentication activity and API key protection.', logs: 'Explore requests, events, and the details behind them.'}[activeTab]}</p></div>
              {tabContent}
            </div>
          </div>
        </div>
      </div>
      {onboardModal}
      {userEditModal}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable bits
// ---------------------------------------------------------------------------
function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <input aria-label={label} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  );
}

function Switch({ checked, onChange, title }: { checked: boolean; onChange: () => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      aria-label={title || 'Toggle setting'}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow-sm transition-transform duration-150 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onChange={() => onChange(!checked)} title={label} />
      <span className="cursor-pointer" onClick={() => onChange(!checked)}>{label}</span>
    </div>
  );
}
