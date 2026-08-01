import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface ModelQuotaBarProps {
  quotaMinutes: number | null;
  usedSeconds: number;
  remainingSeconds: number | null;
  compact?: boolean;
  className?: string;
}

export function ModelQuotaBar({
  quotaMinutes,
  usedSeconds,
  remainingSeconds,
  compact = false,
  className,
}: ModelQuotaBarProps) {
  if (quotaMinutes === null || quotaMinutes === undefined) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        Unlimited
      </span>
    );
  }

  const totalSeconds = quotaMinutes * 60;
  const remaining = remainingSeconds ?? Math.max(0, totalSeconds - usedSeconds);
  const pct = totalSeconds > 0 ? Math.round((remaining / totalSeconds) * 100) : 0;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const low = remaining < 600;

  if (compact) {
    return (
      <span
        className={cn(
          'flex items-center gap-1 text-xs',
          low ? 'text-destructive' : 'text-muted-foreground',
          className
        )}
      >
        <Clock className="w-3 h-3" />
        {hours}h {minutes}m
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            low ? 'bg-destructive' : pct < 30 ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'text-xs font-medium whitespace-nowrap',
          low ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {hours}h {minutes}m / {Math.floor(quotaMinutes / 60)}h {quotaMinutes % 60}m
      </span>
    </div>
  );
}
