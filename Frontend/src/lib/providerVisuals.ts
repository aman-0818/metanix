import type { ProviderType } from '@/types/chat';

interface ProviderVisual {
  logo?: string;
  alt?: string;
  gradient: string;
  accent: string;
  initials: string;
}

// Single source of truth for how a provider_type renders across the sidebar
// (logo image), the model picker (gradient), and the admin panel (accent color
// + initials) — keyed on the stable ProviderType enum, never on an admin-editable
// display name. Values reconciled from the three places this used to be defined
// independently (ChatSidebar/ModelSelector/AdminPanel) so consolidating doesn't
// change how any of them currently look.
const PROVIDER_VISUALS: Record<ProviderType, ProviderVisual> = {
  azure_openai:     { gradient: 'from-blue-500 to-blue-600',     accent: '#3b82f6', initials: 'AZ' },
  azure_ai_foundry: { gradient: 'from-sky-500 to-sky-600',       accent: '#0ea5e9', initials: 'AF' },
  openai:           { logo: '/gpt.png',    alt: 'ChatGPT',   gradient: 'from-cyan-500 to-cyan-600',     accent: '#10b981', initials: 'AI' },
  google:           { logo: '/gemini.png', alt: 'Gemini',    gradient: 'from-yellow-500 to-orange-500', accent: '#ef4444', initials: 'GG' },
  anthropic:        { logo: '/claude.png', alt: 'Claude',    gradient: 'from-violet-500 to-purple-600', accent: '#f97316', initials: 'AN' },
  groq:             { gradient: 'from-gray-500 to-gray-600',     accent: '#8b5cf6', initials: 'GQ' },
  deepseek:         { gradient: 'from-gray-500 to-gray-600',     accent: '#6366f1', initials: 'DS' },
  mistral:          { gradient: 'from-gray-500 to-gray-600',     accent: '#f59e0b', initials: 'MS' },
  cohere:           { gradient: 'from-gray-500 to-gray-600',     accent: '#ec4899', initials: 'CO' },
  xai:              { gradient: 'from-gray-500 to-gray-600',     accent: '#71717a', initials: 'XAI' },
  perplexity:       { gradient: 'from-gray-500 to-gray-600',     accent: '#14b8a6', initials: 'PP' },
  together:         { gradient: 'from-gray-500 to-gray-600',     accent: '#06b6d4', initials: 'TO' },
  ollama:           { logo: '/meta.png',   alt: 'Local model', gradient: 'from-cyan-500 to-cyan-600',   accent: '#a855f7', initials: 'OL' },
  huggingface:      { gradient: 'from-amber-500 to-amber-600',   accent: '#eab308', initials: 'HF' },
  custom:           { gradient: 'from-gray-500 to-gray-600',     accent: '#94a3b8', initials: '?' },
};

const DEFAULT_VISUAL: ProviderVisual = { gradient: 'from-gray-500 to-gray-600', accent: '#94a3b8', initials: '??' };

export function getProviderVisual(providerType?: ProviderType | string | null): ProviderVisual {
  if (!providerType) return DEFAULT_VISUAL;
  return PROVIDER_VISUALS[providerType as ProviderType] ?? {
    ...DEFAULT_VISUAL,
    initials: providerType.slice(0, 2).toUpperCase(),
  };
}

export function getProviderLogo(providerType?: ProviderType | string | null): { src: string; alt: string } | null {
  const visual = getProviderVisual(providerType);
  return visual.logo ? { src: visual.logo, alt: visual.alt ?? providerType ?? 'Provider' } : null;
}
