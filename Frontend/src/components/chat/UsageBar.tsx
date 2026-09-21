import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/hooks/useAuthStore';
import { apiService } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ModelUsage {
  model: string;
  total_tokens: number;
  total_cost: number;
}

const REFRESH_INTERVAL_MS = 20_000;

export function UsageBar() {
  const { user, refreshUser } = useAuthStore();
  const [showBreakdown, setShowBreakdown] = useState(false);
  useEscapeKey(showBreakdown, () => setShowBreakdown(false));
  const [byModel, setByModel] = useState<ModelUsage[]>([]);

  useEffect(() => {
    const loadUsage = async () => {
      refreshUser();
      try {
        const data = await apiService.getUserUsage();
        setByModel(data.by_model || []);
      } catch (error) {
        console.error('Failed to load usage breakdown:', error);
      }
    };
    loadUsage();
    const interval = setInterval(loadUsage, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const used = parseFloat(user.cost_used_usd || '0') || 0;
  const quota = user.cost_quota_usd != null ? parseFloat(user.cost_quota_usd) : null;
  const unlimited = quota === null;
  const percent = !unlimited && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  const barColor = percent > 95 ? 'bg-destructive' : percent > 75 ? 'bg-warning' : 'bg-success';

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setShowBreakdown((v) => !v)}
        aria-controls="usage-breakdown"
        aria-expanded={showBreakdown}
        title="Your token usage and cost across all models"
        className="flex flex-col items-end gap-1 rounded-md px-2 py-1 hover:bg-secondary transition-colors"
      >
        <span className="text-xs font-semibold text-foreground">
          {unlimited ? `$${used.toFixed(2)}` : `$${used.toFixed(2)} / $${quota!.toFixed(2)}`}
        </span>
        {!unlimited && (
          <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </button>

      {showBreakdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowBreakdown(false)} />
          <div id="usage-breakdown" role="region" aria-label="Usage by model" className="absolute top-[calc(100%+8px)] right-0 w-[260px] bg-card border border-border rounded-[14px] shadow-xl p-3 z-20 animate-scale-in">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Usage by model</div>
            {byModel.length === 0 ? (
              <div className="text-xs text-muted-foreground">No usage yet</div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto">
                {byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{m.model}</span>
                    <span className="text-muted-foreground shrink-0">
                      {m.total_tokens.toLocaleString()} tok · ${m.total_cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
