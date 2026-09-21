import { cn } from '@/lib/utils';

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('metanix-brand', className)}>
      <img src="/matenix-logo.png" alt={compact ? 'Metanix' : ''} width="36" height="32" />
      {!compact && <span>METANIX</span>}
    </span>
  );
}

export function WorkspaceLoading() {
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-background"
      role="status"
    >
      <Brand />
      <span className="text-sm text-muted-foreground animate-pulse">Opening your workspace…</span>
    </div>
  );
}
