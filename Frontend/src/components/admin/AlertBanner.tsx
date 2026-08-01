import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AlertVariant = 'error' | 'success' | 'warning' | 'info';

interface AlertBannerProps {
  variant: AlertVariant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<AlertVariant, { border: string; bg: string; text: string; bar: string; icon: ReactNode }> = {
  error: {
    border: 'border-destructive/25', bg: 'bg-destructive/5', text: 'text-destructive', bar: 'bg-destructive',
    icon: <XCircle className="w-4 h-4 shrink-0" />,
  },
  success: {
    border: 'border-success/25', bg: 'bg-success/5', text: 'text-success', bar: 'bg-success',
    icon: <CheckCircle className="w-4 h-4 shrink-0" />,
  },
  warning: {
    border: 'border-warning/25', bg: 'bg-warning/5', text: 'text-warning', bar: 'bg-warning',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
  },
  info: {
    border: 'border-info/25', bg: 'bg-info/5', text: 'text-info', bar: 'bg-info',
    icon: <Info className="w-4 h-4 shrink-0" />,
  },
};

export function AlertBanner({ variant, children, onDismiss, className }: AlertBannerProps) {
  const s = VARIANT_STYLES[variant];
  const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={cn(`flex items-center gap-3 p-3 rounded-xl border ${s.border} ${s.bg} ${s.text} text-sm animate-slide-up`, className)}>
      <div className={`w-1 self-stretch rounded-full ${s.bar} shrink-0`} />
      {s.icon}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
