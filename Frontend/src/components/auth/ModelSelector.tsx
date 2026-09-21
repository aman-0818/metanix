import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/hooks/useAuthStore';
import { apiService } from '@/lib/api';
import {
  Check,
  Sparkles,
  Zap,
  Brain,
  Cpu,
  Cloud,
  LogOut,
  Loader2,
  Code,
  FileText,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LLMProvider } from '@/types/chat';

// ---------------------------------------------------------------------------
// Icon resolver — maps the `icon_name` field from DB to a Lucide icon
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  zap: Zap,
  brain: Brain,
  cpu: Cpu,
  cloud: Cloud,
  code: Code,
  'file-text': FileText,
};

const resolveIcon = (name: string) => ICON_MAP[name] || Sparkles;

const providerLabel = (type: string) => {
  const map: Record<string, string> = {
    azure_openai: 'Azure OpenAI',
    openai: 'OpenAI',
    google: 'Google',
    anthropic: 'Anthropic',
    ollama: 'Local',
    huggingface: 'HuggingFace',
    custom: 'Custom',
  };
  return map[type] || type;
};

// ---------------------------------------------------------------------------
// QuotaBadge — shows remaining hours
// ---------------------------------------------------------------------------
function QuotaBadge({ seconds }: { seconds: number | null | undefined }) {
  if (seconds === null || seconds === undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" /> Unlimited
      </span>
    );
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const low = seconds < 600; // < 10 minutes
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs',
        low ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      <Clock className="w-3 h-3" />
      {h}h {m}m left
    </span>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------
export function ModelSelector() {
  const { selectedModel, setSelectedModel, username, logout } = useAuthStore();
  const [providers, setProviders] = useState<(LLMProvider & { quota_remaining_seconds?: number | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await apiService.getLLMProviders();
        setProviders(data.filter((p) => p.is_active));
        setError(null);

        // Auto-select default or first model
        if (!selectedModel && data.some(p => p.is_active)) {
          const def = data.find((p) => p.is_default && p.is_active) || data.find(p => p.is_active);
          setSelectedModel(def.name, def.id);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
        setError('Failed to load available models');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background p-3 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12"><Brand /><ThemeToggle /></div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="text-xl sm:text-2xl font-bold">{username}</h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>

        {/* Title */}
        <div className="text-center mb-6 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">Choose your thinking partner.</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            The models available in your workspace, ready for your next idea.
          </p>
        </div>

        {/* Model Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading available models...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No AI models are currently available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {providers.map((provider) => {
              const Icon = resolveIcon(provider.icon_name);
              const isSelected = selectedModel === provider.name;

              return (
                <button
                  key={provider.id}
                  onClick={() => setSelectedModel(provider.name, provider.id)}
                  className={cn(
                    'relative text-left p-5 rounded-2xl border transition-all duration-200',
                    'hover:border-primary/40 hover:-translate-y-0.5',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-muted-foreground/30'
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 sm:mb-4 bg-accent'
                    )}
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </div>

                  <div className="pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{provider.display_name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {providerLabel(provider.provider_type)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {provider.description || `${provider.model_name} model`}
                    </p>

                    <div className="flex flex-wrap gap-2 items-center">
                      {provider.supports_code && (
                        <span className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground">
                          Code
                        </span>
                      )}
                      {provider.supports_document_upload && (
                        <span className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground">
                          Documents
                        </span>
                      )}
                      {provider.supports_streaming && (
                        <span className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground">
                          Streaming
                        </span>
                      )}
                      <QuotaBadge
                        seconds={(provider as any).quota_remaining_seconds}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
