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
    <div className={`bg-card border border-border rounded-lg p-2 flex-col items-center gap-0.5 ${hidden ? 'hidden sm:flex' : 'flex'}`}>
      <div className={`w-5 h-5 rounded ${iconBg} flex items-center justify-center [&_svg]:w-3 [&_svg]:h-3`}>{icon}</div>
      <p className={`text-base font-semibold tabular-nums leading-tight ${valueClassName}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground font-medium leading-tight">{label}</p>
    </div>
  );
}
