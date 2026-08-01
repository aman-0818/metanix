import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/hooks/useChatStore';
import { THEME_COLORS } from '@/lib/messageThemes';

const THEMES = Object.entries(THEME_COLORS).map(([id, v]) => ({ id, name: v.label, bg: v.bg, accent: v.accent }));

const SLIDE_COUNTS = [6, 8, 10, 12, 15, 20];

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-primary shrink-0">
      <polyline points="5 13 9 17 19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PresentationControls() {
  const { presentationTheme, slideCount, setPresentationTheme, setSlideCount } = useChatStore();
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showSlidesMenu, setShowSlidesMenu] = useState(false);

  const activeTheme = THEMES.find((t) => t.id === presentationTheme);

  return (
    <div className="surface-card px-4 py-3.5 flex items-center gap-3 animate-slide-up">
      {/* Theme dropdown */}
      <div className="relative">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Theme</span>
        <button
          type="button"
          onClick={() => { setShowThemeMenu((v) => !v); setShowSlidesMenu(false); }}
          aria-haspopup="listbox"
          aria-expanded={showThemeMenu}
          className="flex items-center gap-2 bg-background border border-border rounded-lg pl-2 pr-2.5 py-1.5 text-[12.5px] font-medium hover:border-primary/40 transition-colors min-w-[140px]"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
            style={{ background: activeTheme ? activeTheme.accent : 'linear-gradient(135deg, #999, #ccc)' }}
          />
          <span className="flex-1 text-left truncate">{activeTheme ? activeTheme.name : 'Auto (AI decides)'}</span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', showThemeMenu && 'rotate-180')} />
        </button>

        {showThemeMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowThemeMenu(false)} />
            <div role="listbox" aria-label="Theme" className="absolute bottom-[calc(100%+8px)] left-0 w-[230px] max-h-[280px] overflow-y-auto bg-card border border-border rounded-[14px] shadow-xl p-1.5 z-20 animate-scale-in">
              <button
                role="option"
                aria-selected={!presentationTheme}
                onClick={() => { setPresentationTheme(''); setShowThemeMenu(false); }}
                className={cn(
                  'w-full flex items-center justify-between gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                  !presentationTheme ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
              >
                Auto (AI decides)
                {!presentationTheme && <Check />}
              </button>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  role="option"
                  aria-selected={presentationTheme === t.id}
                  onClick={() => { setPresentationTheme(t.id); setShowThemeMenu(false); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                    presentationTheme === t.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" style={{ background: t.accent }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {presentationTheme === t.id && <Check />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Slide count dropdown */}
      <div className="relative">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Slides</span>
        <button
          type="button"
          onClick={() => { setShowSlidesMenu((v) => !v); setShowThemeMenu(false); }}
          aria-haspopup="listbox"
          aria-expanded={showSlidesMenu}
          className="flex items-center gap-2 bg-background border border-border rounded-lg pl-2.5 pr-2.5 py-1.5 text-[12.5px] font-medium hover:border-primary/40 transition-colors min-w-[110px]"
        >
          <span className="flex-1 text-left truncate">{slideCount ? `${slideCount} slides` : 'Auto'}</span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', showSlidesMenu && 'rotate-180')} />
        </button>

        {showSlidesMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowSlidesMenu(false)} />
            <div role="listbox" aria-label="Slide count" className="absolute bottom-[calc(100%+8px)] left-0 w-[160px] bg-card border border-border rounded-[14px] shadow-xl p-1.5 z-20 animate-scale-in">
              <button
                role="option"
                aria-selected={!slideCount}
                onClick={() => { setSlideCount(0); setShowSlidesMenu(false); }}
                className={cn(
                  'w-full flex items-center justify-between gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                  !slideCount ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
              >
                Auto (AI decides)
                {!slideCount && <Check />}
              </button>
              {SLIDE_COUNTS.map((n) => (
                <button
                  key={n}
                  role="option"
                  aria-selected={slideCount === n}
                  onClick={() => { setSlideCount(n); setShowSlidesMenu(false); }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                    slideCount === n ? 'bg-primary/10' : 'hover:bg-muted/50'
                  )}
                >
                  {n} slides
                  {slideCount === n && <Check />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
