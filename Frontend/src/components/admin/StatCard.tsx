import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconBg?: string;
  valueClassName?: string;
  hidden?: boolean;
}

export function StatCard({ label, value, icon, iconBg = 'bg-primary/10', valueClassName = 'text-foreground', hidden = false }: StatCardProps) {
  return (
    <div className={`bg-card border border-border rounded-xl p-3 sm:p-4 flex-col items-start gap-2 ${hidden ? 'hidden sm:flex' : 'flex'}`}>
      <div className={`w-7 h-7 rounded ${iconBg} flex items-center justify-center [&_svg]:w-3 [&_svg]:h-3`}>{icon}</div>
      <p className={`text-xl sm:text-2xl font-medium tabular-nums leading-tight ${valueClassName}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</p>
    </div>
  );
}
