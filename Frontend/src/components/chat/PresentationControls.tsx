import { useChatStore } from '@/hooks/useChatStore';
import { THEME_COLORS } from '@/lib/messageThemes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function PresentationControls() {
  const { presentationTheme, slideCount, setPresentationTheme, setSlideCount } = useChatStore();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/70 px-3 py-3 animate-fade-in">
      <div className="flex-1 min-w-[130px]">
        <label className="eyebrow block mb-1.5" id="presentation-theme">
          Visual theme
        </label>
        <Select
          value={presentationTheme || 'auto'}
          onValueChange={(value) => setPresentationTheme(value === 'auto' ? '' : value)}
        >
          <SelectTrigger aria-labelledby="presentation-theme" className="h-9 text-xs bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto · AI decides</SelectItem>
            {Object.entries(THEME_COLORS).map(([id, theme]) => (
              <SelectItem key={id} value={id}>
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ background: theme.accent }}
                />
                {theme.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-[120px]">
        <label className="eyebrow block mb-1.5" id="presentation-slides">
          Slide count
        </label>
        <Select value={String(slideCount)} onValueChange={(value) => setSlideCount(Number(value))}>
          <SelectTrigger aria-labelledby="presentation-slides" className="h-9 text-xs bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Auto</SelectItem>
            {[6, 8, 10, 12, 15, 20].map((count) => (
              <SelectItem key={count} value={String(count)}>
                {count} slides
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
