import { Brand } from '@/components/Brand';
import { useChatStore } from '@/hooks/useChatStore';
export function ThinkingIndicator({ stillWorking = false }: { stillWorking?: boolean }) {
  const mode = useChatStore((s) => s.chatMode);
  return (
    <div className="flex items-center gap-3 py-5 animate-fade-in" role="status">
      <Brand compact className="[&_img]:w-7 [&_img]:h-7" />
      <span className="text-sm text-muted-foreground">
        {stillWorking
          ? 'Still working on it…'
          : mode === 'presentation'
            ? 'Building your presentation…'
            : 'Thinking it through…'}
      </span>
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
    </div>
  );
}
