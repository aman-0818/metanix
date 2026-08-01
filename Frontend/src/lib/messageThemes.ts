// Shared PPTX theme palette — used by MessageBubble's retheme picker and
// PresentationControls' theme picker. Single source of truth for id/bg/accent.
export interface MessageTheme {
  gradient: string;
  label: string;
  bg: string;
  accent: string;
}

export const THEME_COLORS: Record<string, MessageTheme> = {
  midnight:    { gradient: 'from-blue-600 to-indigo-600',   label: '🌙 Midnight',    bg: '#0B0E1A', accent: '#389CFF' },
  sunset:      { gradient: 'from-red-500 to-orange-500',    label: '🌅 Sunset',      bg: '#1A0A1E', accent: '#FF6B6B' },
  forest:      { gradient: 'from-green-600 to-emerald-500', label: '🌲 Forest',      bg: '#0A1610', accent: '#00D987' },
  ocean:       { gradient: 'from-cyan-500 to-blue-500',     label: '🌊 Ocean',       bg: '#041220', accent: '#00B4D8' },
  royal:       { gradient: 'from-purple-600 to-pink-500',   label: '👑 Royal',       bg: '#100820', accent: '#A85CFF' },
  clean_light: { gradient: 'from-slate-400 to-blue-400',    label: '✨ Clean Light', bg: '#FAFAFC', accent: '#3B82F6' },
  coral:       { gradient: 'from-rose-500 to-amber-500',    label: '🪸 Coral',       bg: '#180C14', accent: '#FF7979' },
  arctic:      { gradient: 'from-sky-400 to-violet-400',    label: '❄️ Arctic',      bg: '#F4F7FB', accent: '#2263EB' },
  neon:        { gradient: 'from-green-400 to-cyan-400',    label: '⚡ Neon',        bg: '#05050A', accent: '#00FF9D' },
  corporate:   { gradient: 'from-yellow-600 to-amber-500',  label: '🏢 Corporate',   bg: '#0D131F', accent: '#D4AF37' },
  bold:        { gradient: 'from-yellow-400 to-orange-500', label: '⬛ Bold Black',  bg: '#080808', accent: '#FFE000' },
  rose_gold:   { gradient: 'from-rose-400 to-pink-300',     label: '🌸 Rose Gold',   bg: '#1A1214', accent: '#E09080' },
  volcano:     { gradient: 'from-orange-600 to-red-600',    label: '🌋 Volcano',     bg: '#0E0604', accent: '#FF5200' },
  slate:       { gradient: 'from-teal-500 to-cyan-500',     label: '🎯 Slate Pro',   bg: '#F8F9FA', accent: '#0D9E8E' },
};
