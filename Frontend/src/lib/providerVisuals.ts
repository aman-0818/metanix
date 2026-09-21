import type { ProviderType } from '@/types/chat';

interface ProviderVisual {
  logo?: string;
  alt?: string;
  initials: string;
}

// Provider identity is keyed on the API provider type, never the display name.
const PROVIDER_VISUALS: Record<ProviderType, ProviderVisual> = {
  azure_openai:     { initials: 'AZ' },
  azure_ai_foundry: { initials: 'AF' },
  openai:           { logo: '/gpt.png',    alt: 'ChatGPT',   initials: 'AI' },
  google:           { logo: '/gemini.png', alt: 'Gemini',    initials: 'GG' },
  anthropic:        { logo: '/claude.png', alt: 'Claude',    initials: 'AN' },
  groq:             { initials: 'GQ' },
  deepseek:         { initials: 'DS' },
  mistral:          { initials: 'MS' },
  cohere:           { initials: 'CO' },
  xai:              { initials: 'XAI' },
  perplexity:       { initials: 'PP' },
  together:         { initials: 'TO' },
  ollama:           { logo: '/meta.png',   alt: 'Local model', initials: 'OL' },
  huggingface:      { initials: 'HF' },
  custom:           { initials: '?' },
};

const DEFAULT_VISUAL: ProviderVisual = { initials: '??' };

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
