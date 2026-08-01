import { useState, useEffect, useCallback } from 'react';
import { apiService } from '@/lib/api';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  BarChart3, TrendingUp, Users, Cpu, Clock, DollarSign,
  RefreshCw, Activity, Zap, Calendar, Download,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AnalyticsData {
  period: { start: string; end: string; days: number };
  totals: {
    total_requests: number;
    total_tokens: number | null;
    total_prompt_tokens: number | null;
    total_cached_tokens: number | null;
    total_completion_tokens: number | null;
    total_cost: number | null;
    avg_tokens_per_request: number | null;
    avg_latency: number | null;
    max_latency: number | null;
    min_latency: number | null;
    unique_users: number;
    active_models: number;
  };
  daily_trend: Array<{
    date: string;
    requests: number;
    tokens: number;
    cached_tokens: number;
    cost: number;
    users: number;
    avg_latency: number | null;
  }>;
  by_model: Array<{
    provider: string;
    model: string;
    requests: number;
    total_tokens: number;
    prompt_tokens: number;
    cached_tokens: number;
    completion_tokens: number;
    total_cost: number;
    avg_latency: number | null;
    unique_users: number;
    last_used: string | null;
  }>;
  by_user: Array<{
    user__id: number;
    user__username: string;
    user__email: string | null;
    requests: number;
    total_tokens: number;
    prompt_tokens: number;
    cached_tokens: number;
    completion_tokens: number;
    total_cost: number;
    avg_latency: number | null;
    models_used: number;
    last_active: string | null;
  }>;
  activity_by_hour: Array<{ hour: number; requests: number }>;
  cost_by_provider: Array<{
    provider: string;
    total_cost: number;
    total_tokens: number;
    cached_tokens: number;
    requests: number;
  }>;
  user_model_breakdown: Array<{
    user__id: number;
    user__username: string;
    provider: string;
    model: string;
    requests: number;
    total_tokens: number;
    cached_tokens: number;
    total_cost: number;
    avg_latency: number | null;
    last_used: string | null;
  }>;
  model_popularity: Array<{
    provider: string;
    model: string;
    request_count: number;
    unique_users: number;
    total_tokens: number;
    cached_tokens: number;
    total_cost: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n: number | null | undefined, decimals = 0): string => {
  if (n === null || n === undefined) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(decimals);
};

const fmtCost = (n: number | null | undefined): string => {
  if (n === null || n === undefined || n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};

// Django serializes datetimes as raw ISO-8601 with microseconds (e.g.
// "2026-07-24T16:17:47.111025+00:00") — reformat those into a readable
// local timestamp before they hit a CSV cell. Date-only strings (no "T")
// are left untouched.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const formatCsvValue = (v: any): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (ISO_DATETIME_RE.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return s;
};

// Plain browser APIs only (Blob + a temporary <a download>) — no export library needed.
function exportToCSV(filename: string, rows: Array<Record<string, any>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = formatCsvValue(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fmtLatency = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
};

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// For a custom range's calendar-day boundaries (stored as UTC midnight/end-of-day) —
// converting to the viewer's local timezone before formatting can roll the date over
// to the next/previous day, so this formats the UTC calendar date directly instead.
const fmtDateUTC = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const fmtDateTime = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleString();
};

const pctOf = (part: number | null, total: number | null): number => {
  if (!part || !total || total === 0) return 0;
  return (part / total) * 100;
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-emerald-500',
  azure_openai: 'bg-blue-500',
  google: 'bg-amber-500',
  anthropic: 'bg-orange-500',
  ollama: 'bg-violet-500',
  huggingface: 'bg-rose-500',
  custom: 'bg-slate-500',
};

const PROVIDER_BG: Record<string, string> = {
  openai: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  azure_openai: 'bg-blue-50 border-blue-200 text-blue-700',
  google: 'bg-amber-50 border-amber-200 text-amber-700',
  anthropic: 'bg-orange-50 border-orange-200 text-orange-700',
  ollama: 'bg-violet-50 border-violet-200 text-violet-700',
  huggingface: 'bg-rose-50 border-rose-200 text-rose-700',
  custom: 'bg-slate-50 border-slate-200 text-slate-700',
};

// ---------------------------------------------------------------------------
// Mini bar chart (pure CSS)
// ---------------------------------------------------------------------------
function MiniBar({ data, maxVal, color = 'bg-indigo-500' }: { data: number[]; maxVal: number; color?: string }) {
  return (
    <div className="flex items-end gap-[2px] h-10">
      {data.map((v, i) => (
        <div
          key={i}
          className={`${color} rounded-t opacity-80 hover:opacity-100 transition-opacity`}
          style={{ width: '4px', height: `${maxVal > 0 ? Math.max(2, (v / maxVal) * 100) : 2}%` }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function ProgressBar({ value, max, color = 'bg-indigo-500', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Heatmap (24h)
// ---------------------------------------------------------------------------
function HourlyHeatmap({ data }: { data: Array<{ hour: number; requests: number }> }) {
  const maxReq = Math.max(1, ...data.map(d => d.requests));
  return (
    <div className="overflow-x-auto">
    <div className="flex gap-1 items-end min-w-[300px]">
      {data.map(d => {
        const intensity = d.requests / maxReq;
        const bg = intensity === 0 ? 'bg-muted' :
          intensity < 0.25 ? 'bg-indigo-200' :
          intensity < 0.5 ? 'bg-indigo-300' :
          intensity < 0.75 ? 'bg-indigo-400' : 'bg-indigo-600';
        return (
          <div key={d.hour} className="flex flex-col items-center gap-1">
            <div
              tabIndex={0}
              aria-label={`${d.hour}:00 — ${d.requests} requests`}
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded ${bg} transition-colors hover:ring-2 focus:ring-2 focus:outline-none hover:ring-indigo-400 focus:ring-indigo-400 cursor-default`}
              title={`${d.hour}:00 — ${d.requests} requests`}
            />
            {d.hour % 6 === 0 && (
              <span className="text-[10px] text-muted-foreground">{d.hour}h</span>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-600', bgColor = 'bg-indigo-50' }: {
  icon: any; label: string; value: string; sub?: string; color?: string; bgColor?: string;
}) {
  return (
    <div className="surface-card p-2 flex flex-col items-center text-center gap-0.5">
      <div className={`w-5 h-5 rounded ${bgColor} flex items-center justify-center`}>
        <Icon className={`w-3 h-3 ${color}`} />
      </div>
      <p className="text-base font-semibold text-foreground leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function UsageAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [section, setSection] = useState<'overview' | 'models' | 'users' | 'details'>('overview');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  useEscapeKey(showRangePicker, () => setShowRangePicker(false));

  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError('');
    try {
      const resp = customRange
        ? await apiService.getUsageAnalytics({ start: customRange.start, end: customRange.end, refresh: forceRefresh })
        : await apiService.getUsageAnalytics({ days, refresh: forceRefresh });
      setData(resp);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
      console.error(err);
    }
    setLoading(false);
  }, [days, customRange]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive mb-4">{error}</p>
        <button onClick={() => loadData()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals;

  return (
    <div className="space-y-6">
      {/* Section tabs + date range — one row, shared across all 4 sections */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-mobile-hide">
          {([
            { key: 'overview', label: 'Overview', icon: TrendingUp },
            { key: 'models', label: 'Models', icon: Cpu },
            { key: 'users', label: 'Users', icon: Users },
            { key: 'details', label: 'Logs', icon: Activity },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setSection(tab.key)}
              className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                section === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {[1, 7, 30].map(d => (
            <button key={d} onClick={() => { setCustomRange(null); setDays(d); }}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                !customRange && days === d ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted hover:bg-muted/80 text-foreground border-transparent'
              }`}>
              {d}D
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => {
                setDraftStart(customRange ? customRange.start.slice(0, 10) : '');
                setDraftEnd(customRange ? customRange.end.slice(0, 10) : '');
                setShowRangePicker(v => !v);
              }}
              aria-haspopup="dialog"
              aria-expanded={showRangePicker}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                customRange ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted hover:bg-muted/80 text-foreground border-transparent'
              }`}>
              <Calendar className="w-3.5 h-3.5" />
              {customRange ? `${fmtDateUTC(customRange.start)} – ${fmtDateUTC(customRange.end)}` : 'Select range'}
            </button>

            {showRangePicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRangePicker(false)} />
                <div role="dialog" aria-label="Select custom date range"
                  className="absolute top-[calc(100%+8px)] right-0 w-64 bg-card border border-border rounded-xl shadow-xl p-3 z-20 animate-scale-in space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Start date</label>
                    <input type="date" value={draftStart} max={draftEnd || undefined}
                      onChange={e => setDraftStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">End date</label>
                    <input type="date" value={draftEnd} min={draftStart || undefined} max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setDraftEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setCustomRange({ start: `${draftStart}T00:00:00Z`, end: `${draftEnd}T23:59:59Z` });
                        setShowRangePicker(false);
                      }}
                      disabled={!draftStart || !draftEnd}
                      className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                      Apply
                    </button>
                    <button onClick={() => setShowRangePicker(false)}
                      className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => loadData(true)} disabled={loading} title="Refresh (bypasses the 2-minute cache)"
            className="p-1.5 rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* OVERVIEW */}
      {/* ============================================================= */}
      {section === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-4">
            <StatCard icon={Zap} label="Total Requests" value={fmt(t.total_requests)}
              color="text-indigo-600" bgColor="bg-indigo-50" />
            <StatCard icon={BarChart3} label="Total Tokens" value={fmt(t.total_tokens)}
              sub={`${fmt(t.total_prompt_tokens)} in / ${fmt(t.total_completion_tokens)} out`}
              color="text-blue-600" bgColor="bg-blue-50" />
            <StatCard icon={Cpu} label="Cache Tokens" value={fmt(t.total_cached_tokens)}
              sub={pctOf(t.total_cached_tokens, t.total_prompt_tokens).toFixed(0) + '% of input'}
              color="text-teal-600" bgColor="bg-teal-50" />
            <StatCard icon={DollarSign} label="Total Cost" value={fmtCost(t.total_cost)}
              color="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard icon={Users} label="Active Users" value={String(t.unique_users)}
              color="text-violet-600" bgColor="bg-violet-50" />
            <StatCard icon={Cpu} label="Models Used" value={String(t.active_models)}
              color="text-amber-600" bgColor="bg-amber-50" />
            <StatCard icon={Clock} label="Avg Latency" value={fmtLatency(t.avg_latency)}
              sub={`Max: ${fmtLatency(t.max_latency)}`}
              color="text-rose-600" bgColor="bg-rose-50" />
          </div>

          {/* Daily Trend */}
          {data.daily_trend.length > 0 && (
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  Daily Usage Trend
                </h4>
                <button onClick={() => exportToCSV(`usage-overview-${data.period.start.slice(0, 10)}_${data.period.end.slice(0, 10)}.csv`, data.daily_trend)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Chart bars */}
                  <div className="flex items-end gap-1 h-32 mb-2">
                    {data.daily_trend.map((d, i) => {
                      const maxTokens = Math.max(1, ...data.daily_trend.map(x => x.tokens || 0));
                      const h = ((d.tokens || 0) / maxTokens) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div className="absolute bottom-full mb-1 hidden group-hover:block group-focus:block bg-foreground text-background text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                            {fmtDate(d.date)}: {fmt(d.tokens)} tokens ({fmt(d.cached_tokens)} cached) · {d.requests} req · {fmtCost(d.cost)}
                          </div>
                          <div
                            tabIndex={0}
                            aria-label={`${fmtDate(d.date)}: ${fmt(d.tokens)} tokens, ${fmt(d.cached_tokens)} cached · ${d.requests} req · ${fmtCost(d.cost)}`}
                            className="w-full bg-indigo-500 rounded-t hover:bg-indigo-600 transition-colors cursor-default focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            style={{ height: `${Math.max(2, h)}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {/* X-axis labels */}
                  <div className="flex gap-1">
                    {data.daily_trend.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        {(i === 0 || i === data.daily_trend.length - 1 || i % Math.ceil(data.daily_trend.length / 7) === 0) && (
                          <span className="text-[10px] text-muted-foreground">{fmtDate(d.date)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Summary row */}
              <div className="flex flex-wrap gap-3 sm:gap-6 mt-4 pt-4 border-t text-xs sm:text-sm">
                <div>
                  <span className="text-muted-foreground">Avg daily requests: </span>
                  <span className="font-semibold">{fmt(t.total_requests / Math.max(1, data.daily_trend.length))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg daily tokens: </span>
                  <span className="font-semibold">{fmt((t.total_tokens || 0) / Math.max(1, data.daily_trend.length))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg daily cache tokens: </span>
                  <span className="font-semibold">{fmt((t.total_cached_tokens || 0) / Math.max(1, data.daily_trend.length))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg daily cost: </span>
                  <span className="font-semibold">{fmtCost((t.total_cost || 0) / Math.max(1, data.daily_trend.length))}</span>
                </div>
              </div>
            </div>
          )}

          {/* Activity Heatmap + Cost by Provider */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Activity */}
            <div className="surface-card p-3 sm:p-5">
              <h4 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                <Clock className="w-4 h-4 text-indigo-600" />
                Activity by Hour of Day
              </h4>
              <HourlyHeatmap data={data.activity_by_hour} />
              {data.activity_by_hour.length > 0 && (() => {
                const peak = data.activity_by_hour.reduce((a, b) => (a.requests > b.requests ? a : b));
                return (
                  <p className="text-xs text-muted-foreground mt-3">
                    Peak hour: {peak.hour}:00 ({peak.requests} requests)
                  </p>
                );
              })()}
            </div>

            {/* Cost by Provider */}
            <div className="surface-card p-3 sm:p-5">
              <h4 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Cost by Provider
              </h4>
              <div className="space-y-3">
                {data.cost_by_provider.map(cp => {
                  const totalCost = data.cost_by_provider.reduce((s, x) => s + (x.total_cost || 0), 0);
                  return (
                    <div key={cp.provider}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${PROVIDER_BG[cp.provider] || PROVIDER_BG.custom}`}>
                          {cp.provider}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{cp.requests} req</span>
                          <span className="text-muted-foreground">{fmt(cp.cached_tokens)} cached</span>
                          <span className="font-semibold">{fmtCost(cp.total_cost)}</span>
                        </div>
                      </div>
                      <ProgressBar
                        value={cp.total_cost || 0}
                        max={totalCost || 1}
                        color={PROVIDER_COLORS[cp.provider] || 'bg-slate-500'}
                      />
                    </div>
                  );
                })}
                {data.cost_by_provider.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Model Popularity Ranking */}
          {data.model_popularity && data.model_popularity.length > 0 && (
            <div className="surface-card p-3 sm:p-5">
              <h4 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                Most Used Models
              </h4>
              <div className="space-y-3">
                {data.model_popularity.map((m, i) => {
                  const maxReqs = data.model_popularity[0]?.request_count || 1;
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                  return (
                    <div key={`${m.provider}-${m.model}`} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center font-bold shrink-0">{medal}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PROVIDER_COLORS[m.provider] || 'bg-slate-500'}`} />
                            <span className="font-semibold text-sm truncate">{m.model}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${PROVIDER_BG[m.provider] || PROVIDER_BG.custom}`}>
                              {m.provider}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                            <span className="text-muted-foreground">{m.unique_users} user{m.unique_users !== 1 ? 's' : ''}</span>
                            <span className="font-bold">{m.request_count.toLocaleString()} req</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${PROVIDER_COLORS[m.provider] || 'bg-slate-500'}`}
                            style={{ width: `${(m.request_count / maxReqs) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* MODEL ANALYTICS */}
      {/* ============================================================= */}
      {section === 'models' && (
        <div className="space-y-6">
          {/* Model cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {data.by_model.map((m, i) => {
              const totalTokens = data.by_model.reduce((s, x) => s + x.total_tokens, 0);
              const totalReqs = data.by_model.reduce((s, x) => s + x.requests, 0);
              return (
                <div key={m.model} className="surface-card p-3 sm:p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[m.provider] || 'bg-slate-500'}`} />
                        <h4 className="font-semibold">{m.model}</h4>
                      </div>
                      <span className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium border ${PROVIDER_BG[m.provider] || PROVIDER_BG.custom}`}>
                        {m.provider}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{fmt(m.total_tokens)}</p>
                      <p className="text-xs text-muted-foreground">tokens</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center mb-3">
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-sm font-bold">{m.requests}</p>
                      <p className="text-[10px] text-muted-foreground">Requests</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-sm font-bold">{fmt(m.cached_tokens)}</p>
                      <p className="text-[10px] text-muted-foreground">Cache Tokens</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-sm font-bold">{fmtCost(m.total_cost)}</p>
                      <p className="text-[10px] text-muted-foreground">Cost</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-sm font-bold">{fmtLatency(m.avg_latency)}</p>
                      <p className="text-[10px] text-muted-foreground">Avg Latency</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <ProgressBar value={m.total_tokens} max={totalTokens} label="Token share"
                      color={PROVIDER_COLORS[m.provider] || 'bg-slate-500'} />
                    <ProgressBar value={m.requests} max={totalReqs} label="Request share"
                      color={PROVIDER_COLORS[m.provider] || 'bg-slate-500'} />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground mt-3 pt-3 border-t">
                    <span>{m.unique_users} user{m.unique_users !== 1 ? 's' : ''}</span>
                    <span>{fmt(m.prompt_tokens)} in / {fmt(m.completion_tokens)} out</span>
                    <span>Last: {fmtDateTime(m.last_used)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {data.by_model.length === 0 && (
            <p className="text-center text-muted-foreground py-10">No model usage data yet</p>
          )}

          {/* Model comparison table */}
          {data.by_model.length > 0 && (
            <div className="surface-card overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h4 className="font-semibold">Model Comparison</h4>
                <button onClick={() => exportToCSV(`usage-models-${data.period.start.slice(0, 10)}_${data.period.end.slice(0, 10)}.csv`, data.by_model)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Model</th>
                      <th className="px-4 py-3 text-left font-semibold">Provider</th>
                      <th className="px-4 py-3 text-right font-semibold">Requests</th>
                      <th className="px-4 py-3 text-right font-semibold">Total Tokens</th>
                      <th className="px-4 py-3 text-right font-semibold">Cache Tokens</th>
                      <th className="px-4 py-3 text-right font-semibold">Avg Tokens/Req</th>
                      <th className="px-4 py-3 text-right font-semibold">Cost</th>
                      <th className="px-4 py-3 text-right font-semibold">Avg Latency</th>
                      <th className="px-4 py-3 text-right font-semibold">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_model.map((m, i) => (
                      <tr key={m.model} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{m.model}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${PROVIDER_BG[m.provider] || PROVIDER_BG.custom}`}>
                            {m.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{m.requests.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{m.total_tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{m.cached_tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">{m.requests > 0 ? Math.round(m.total_tokens / m.requests).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmtCost(m.total_cost)}</td>
                        <td className="px-4 py-3 text-right">{fmtLatency(m.avg_latency)}</td>
                        <td className="px-4 py-3 text-right">{m.unique_users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* USER ANALYTICS */}
      {/* ============================================================= */}
      {section === 'users' && (
        <div className="space-y-6">
          {/* User summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <StatCard icon={Users} label="Total Active Users" value={String(t.unique_users)}
              color="text-violet-600" bgColor="bg-violet-50" />
            <StatCard icon={Zap} label="Avg Requests/User"
              value={t.unique_users > 0 ? fmt(t.total_requests / t.unique_users) : '0'}
              color="text-indigo-600" bgColor="bg-indigo-50" />
            <StatCard icon={Cpu} label="Avg Cache Tokens/User"
              value={t.unique_users > 0 ? fmt((t.total_cached_tokens || 0) / t.unique_users) : '0'}
              color="text-teal-600" bgColor="bg-teal-50" />
            <StatCard icon={DollarSign} label="Avg Cost/User"
              value={t.unique_users > 0 ? fmtCost((t.total_cost || 0) / t.unique_users) : '$0'}
              color="text-emerald-600" bgColor="bg-emerald-50" />
          </div>

          {/* User table */}
          <div className="surface-card overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h4 className="text-sm font-semibold">User Usage Breakdown</h4>
              <button onClick={() => exportToCSV(`usage-users-${data.period.start.slice(0, 10)}_${data.period.end.slice(0, 10)}.csv`, data.by_user)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted transition-colors">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">User</th>
                    <th className="px-4 py-3 text-right font-semibold">Requests</th>
                    <th className="px-4 py-3 text-right font-semibold">Total Tokens</th>
                    <th className="px-4 py-3 text-right font-semibold">Prompt</th>
                    <th className="px-4 py-3 text-right font-semibold">Cache</th>
                    <th className="px-4 py-3 text-right font-semibold">Completion</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Avg Latency</th>
                    <th className="px-4 py-3 text-right font-semibold">Models</th>
                    <th className="px-4 py-3 text-right font-semibold">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_user.map((u, i) => {
                    const maxTokens = data.by_user.length > 0 ? data.by_user[0].total_tokens : 1;
                    return (
                      <tr key={u.user__id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{u.user__username}</p>
                            {u.user__email && <p className="text-xs text-muted-foreground">{u.user__email}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">{u.requests.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${pctOf(u.total_tokens, maxTokens)}%` }} />
                            </div>
                            <span className="font-medium">{fmt(u.total_tokens)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(u.prompt_tokens)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(u.cached_tokens)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(u.completion_tokens)}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmtCost(u.total_cost)}</td>
                        <td className="px-4 py-3 text-right">{fmtLatency(u.avg_latency)}</td>
                        <td className="px-4 py-3 text-right">{u.models_used}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmtDateTime(u.last_active)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.by_user.length === 0 && (
              <p className="text-center text-muted-foreground py-10">No user usage data yet</p>
            )}
          </div>

          {/* Per-User Model Breakdown */}
          {data.user_model_breakdown && data.user_model_breakdown.length > 0 && (
            <UserModelBreakdown
              breakdown={data.user_model_breakdown}
              users={data.by_user}
            />
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* DETAILED LOGS */}
      {/* ============================================================= */}
      {section === 'details' && (
        <DetailedLogsSection />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-User Model Breakdown sub-component
// ---------------------------------------------------------------------------
function UserModelBreakdown({ breakdown, users }: {
  breakdown: AnalyticsData['user_model_breakdown'];
  users: AnalyticsData['by_user'];
}) {
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  // Group breakdown by user (skip null/deleted users)
  const byUser = new Map<number, typeof breakdown>();
  for (const row of breakdown) {
    const userId = row.user__id;
    if (userId == null) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(row);
  }

  // Sort users by total requests desc
  const userIds = [...byUser.keys()].sort((a, b) => {
    const aReqs = byUser.get(a)!.reduce((s, r) => s + r.requests, 0);
    const bReqs = byUser.get(b)!.reduce((s, r) => s + r.requests, 0);
    return bReqs - aReqs;
  });

  return (
    <div className="surface-card overflow-hidden">
      <div className="p-4 border-b">
        <h4 className="font-semibold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-600" />
          Per-User Model Usage
        </h4>
        <p className="text-sm text-muted-foreground">Click a user to see which models they used and how much</p>
      </div>
      <div className="divide-y">
        {userIds.map(userId => {
          const models = byUser.get(userId)!;
          const username = models[0].user__username || 'Unknown';
          const totalReqs = models.reduce((s, r) => s + r.requests, 0);
          const totalTokens = models.reduce((s, r) => s + r.total_tokens, 0);
          const totalCost = models.reduce((s, r) => s + (r.total_cost || 0), 0);
          const isExpanded = expandedUser === userId;

          return (
            <div key={userId}>
              {/* User row — clickable */}
              <button
                onClick={() => setExpandedUser(isExpanded ? null : userId)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    isExpanded ? 'bg-violet-600' : 'bg-slate-400'
                  }`}>
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{username}</p>
                    <p className="text-xs text-muted-foreground">{models.length} model{models.length !== 1 ? 's' : ''} used</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">{totalReqs} req</span>
                  <span className="font-medium">{fmt(totalTokens)} tokens</span>
                  <span className="font-medium">{fmtCost(totalCost)}</span>
                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded model breakdown */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-muted/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                    {models.map(m => {
                      const pct = totalReqs > 0 ? ((m.requests / totalReqs) * 100) : 0;
                      return (
                        <div key={`${m.provider}-${m.model}`}
                          className="bg-card rounded-lg border p-3 hover:shadow-sm transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PROVIDER_COLORS[m.provider] || 'bg-slate-500'}`} />
                            <span className="font-semibold text-sm truncate">{m.model}</span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Requests</span>
                              <span className="font-medium">{m.requests} ({pct.toFixed(1)}%)</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${PROVIDER_COLORS[m.provider] || 'bg-slate-500'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Tokens</span>
                              <span className="font-medium">{fmt(m.total_tokens)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Cache Tokens</span>
                              <span className="font-medium">{fmt(m.cached_tokens)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Cost</span>
                              <span className="font-medium">{fmtCost(m.total_cost)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Avg Latency</span>
                              <span>{fmtLatency(m.avg_latency)}</span>
                            </div>
                            {m.last_used && (
                              <div className="text-[10px] text-muted-foreground pt-1 border-t">
                                Last used: {fmtDateTime(m.last_used)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {userIds.length === 0 && (
          <p className="text-center text-muted-foreground py-10">No per-user model data yet</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detailed Logs sub-component (with its own pagination)
// ---------------------------------------------------------------------------
function DetailedLogsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterUsername, setFilterUsername] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const exportLogs = useCallback(async () => {
    setIsExporting(true);
    try {
      // 200 is the backend's own hard cap (get_llm_usage_logs) — matches
      // whatever the current filters select, not just the visible page.
      const resp = await apiService.getAdminUsageLogs({
        limit: 200, offset: 0,
        provider: filterProvider || undefined,
        username: filterUsername || undefined,
        model: filterModel || undefined,
      });
      exportToCSV(`usage-logs-${new Date().toISOString().slice(0, 10)}.csv`, resp.results || []);
    } catch (err) {
      console.error(err);
    }
    setIsExporting(false);
  }, [filterProvider, filterUsername, filterModel]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiService.getAdminUsageLogs({
        limit, offset,
        provider: filterProvider || undefined,
        username: filterUsername || undefined,
        model: filterModel || undefined,
      });
      setRows(resp.results || []);
      setCount(resp.count || 0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [limit, offset, filterProvider, filterUsername, filterModel]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
        <input value={filterProvider} onChange={e => { setFilterProvider(e.target.value); setOffset(0); }}
          placeholder="Provider..."
          className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-36" />
        <input value={filterUsername} onChange={e => { setFilterUsername(e.target.value); setOffset(0); }}
          placeholder="Username..."
          className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-36" />
        <input value={filterModel} onChange={e => { setFilterModel(e.target.value); setOffset(0); }}
          placeholder="Model..."
          className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-36" />
        <button onClick={() => { setFilterProvider(''); setFilterUsername(''); setFilterModel(''); setOffset(0); }}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-muted">
          Clear
        </button>
        <span className="text-sm text-muted-foreground ml-auto">{count} total records</span>
        <button onClick={exportLogs} disabled={isExporting || count === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-4 py-3 text-left font-semibold">Provider</th>
                <th className="px-4 py-3 text-left font-semibold">Model</th>
                <th className="px-4 py-3 text-right font-semibold">Prompt</th>
                <th className="px-4 py-3 text-right font-semibold">Cache</th>
                <th className="px-4 py-3 text-right font-semibold">Completion</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Latency</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground italic">No logs found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id || i} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-medium">{r.user || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${PROVIDER_BG[r.provider] || PROVIDER_BG.custom}`}>
                      {r.provider}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.model}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{(r.prompt_tokens || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{(r.cached_tokens || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{(r.completion_tokens || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{(r.total_tokens || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">{fmtCost(parseFloat(r.cost_usd || '0'))}</td>
                  <td className="px-4 py-2.5 text-right">{fmtLatency(r.latency_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {count > 0 ? `${offset + 1}–${Math.min(offset + limit, count)} of ${count}` : 'No results'}
        </span>
        <div className="flex gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-muted">
            Previous
          </button>
          <button disabled={offset + limit >= count} onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-muted">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
