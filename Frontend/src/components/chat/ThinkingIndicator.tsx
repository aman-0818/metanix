export function ThinkingIndicator({ stillWorking = false }: { stillWorking?: boolean }) {
  return (
    <div className="flex items-start animate-slide-up">
      <div className="surface-card px-5 py-4 flex items-center gap-2">
        <div className="flex gap-[5px]">
          <span className="dot-bounce w-[7px] h-[7px] rounded-full bg-chat-thinking" style={{ animation: 'dotBounce 1.1s infinite ease-in-out' }} />
          <span className="dot-bounce w-[7px] h-[7px] rounded-full bg-chat-thinking" style={{ animation: 'dotBounce 1.1s infinite ease-in-out 0.15s' }} />
          <span className="dot-bounce w-[7px] h-[7px] rounded-full bg-chat-thinking" style={{ animation: 'dotBounce 1.1s infinite ease-in-out 0.3s' }} />
        </div>
        {stillWorking && (
          <span className="text-xs text-muted-foreground animate-fade-in">Still working…</span>
        )}
      </div>
    </div>
  );
}
