import { useState, useEffect } from 'react';
import { apiService } from '@/lib/api';
import { LogIn, AlertCircle, Filter, RefreshCw, MapPin, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignInLog {
  id: number;
  user_display: string;
  username: string;
  status: string;
  status_display: string;
  ip_address: string | null;
  location: string;
  user_agent: string;
  authentication_method: string;
  auth_method_display: string;
  timestamp: string;
  failure_reason?: string;
}

interface AuditLog {
  id: number;
  performed_by_display: string;
  action: string;
  action_display: string;
  action_target: string;
  action_target_type: string;
  action_target_type_display: string;
  description: string;
  timestamp: string;
}

interface LogStats {
  sign_in_stats: {
    total: number;
    successful: number;
    failed: number;
    auth_methods: Record<string, number>;
  };
  recent_sign_ins: SignInLog[];
  recent_audits: AuditLog[];
}

/** Extract a short browser/OS label from a full user-agent string */
function parseUserAgent(ua: string): string {
  if (!ua) return '';
  // Try to extract browser name
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('python-httpx') || ua.includes('httpx')) return 'API Client';
  if (ua.includes('PostmanRuntime')) return 'Postman';
  // Fallback: first 20 chars
  return ua.substring(0, 20) + (ua.length > 20 ? '…' : '');
}

export function LogsViewer() {
  const [activeTab, setActiveTab] = useState<'sign-in' | 'audit' | 'stats'>('sign-in');
  const [signInLogs, setSignInLogs] = useState<SignInLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [authMethodFilter, setAuthMethodFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [performedByFilter, setPerformedByFilter] = useState('');

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadSignInLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (authMethodFilter) params.append('auth_method', authMethodFilter);
      if (usernameFilter) params.append('username', usernameFilter);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await apiService.request(
        `/admin/logs/sign-in/?${params.toString()}`,
        { method: 'GET' }
      );

      setSignInLogs(response.results);
      setTotalCount(response.count);
    } catch (err) {
      setError('Failed to load sign-in logs');
      console.error(err);
    }
    setLoading(false);
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (performedByFilter) params.append('performed_by', performedByFilter);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await apiService.request(
        `/admin/logs/audit/?${params.toString()}`,
        { method: 'GET' }
      );

      setAuditLogs(response.results);
      setTotalCount(response.count);
    } catch (err) {
      setError('Failed to load audit logs');
      console.error(err);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    setLoading(true);
    setError('');
    // Load statistics
    try {
      const response = await apiService.request(
        '/admin/logs/stats/',
        { method: 'GET' }
      );

      setStats(response);
    } catch (err) {
      setError('Failed to load log statistics');
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'sign-in') {
      loadSignInLogs();
    } else if (activeTab === 'audit') {
      loadAuditLogs();
    } else if (activeTab === 'stats') {
      loadStats();
    }
  }, [activeTab, statusFilter, authMethodFilter, usernameFilter, actionFilter, performedByFilter, offset]);

  const handleRefresh = () => {
    setOffset(0);
    if (activeTab === 'sign-in') {
      loadSignInLogs();
    } else if (activeTab === 'audit') {
      loadAuditLogs();
    } else {
      loadStats();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadgeClass = (status: string) => {
    return status === 'success'
      ? 'bg-primary/10 text-primary'
      : 'bg-destructive/10 text-destructive';
  };

  const getActionBadgeClass = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create')) {
      return 'bg-primary/10 text-primary';
    }
    if (actionLower.includes('update')) {
      return 'bg-warning/10 text-warning';
    }
    if (actionLower.includes('delete')) {
      return 'bg-destructive/10 text-destructive';
    }
    return 'bg-muted text-muted-foreground';
  };

  const TABS = [
    { id: 'sign-in' as const, label: 'Sign-In Logs', shortLabel: 'Sign-In', icon: LogIn },
    { id: 'audit' as const, label: 'Audit Logs', shortLabel: 'Audit', icon: AlertCircle },
    { id: 'stats' as const, label: 'Stats', shortLabel: 'Stats', icon: Filter },
  ];

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex border-b-2 border-border mb-4 sm:mb-6 gap-1 sm:gap-2 overflow-x-auto scrollbar-mobile-hide">
        {TABS.map(({ id, label, shortLabel, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-3 sm:px-6 py-2 sm:py-3 font-semibold border-b-4 transition-all whitespace-nowrap text-sm sm:text-base',
              activeTab === id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Icon size={16} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg text-sm border flex items-center gap-2 bg-destructive/10 text-destructive border-destructive/25">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {activeTab === 'sign-in' && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setOffset(0);
                }}
                className="px-3 py-2 rounded-md text-sm flex-1 sm:flex-none min-w-0 border bg-background border-border"
              >
                <option value="">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={authMethodFilter}
                onChange={(e) => {
                  setAuthMethodFilter(e.target.value);
                  setOffset(0);
                }}
                className="px-3 py-2 rounded-md text-sm flex-1 sm:flex-none min-w-0 border bg-background border-border"
              >
                <option value="">All Methods</option>
                <option value="local">Local</option>
                <option value="azure_ad">Azure AD</option>
              </select>
              <input
                type="text"
                placeholder="Username..."
                value={usernameFilter}
                onChange={(e) => {
                  setUsernameFilter(e.target.value);
                  setOffset(0);
                }}
                className="px-3 py-2 rounded-md text-sm w-full sm:w-auto border bg-background border-border"
              />
            </>
          )}
          {activeTab === 'audit' && (
            <>
              <input
                type="text"
                placeholder="Action..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setOffset(0);
                }}
                className="px-3 py-2 rounded-md text-sm flex-1 sm:flex-none min-w-0 border bg-background border-border"
              />
              <input
                type="text"
                placeholder="Performed by..."
                value={performedByFilter}
                onChange={(e) => {
                  setPerformedByFilter(e.target.value);
                  setOffset(0);
                }}
                className="px-3 py-2 rounded-md text-sm flex-1 sm:flex-none min-w-0 border bg-background border-border"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold transition-colors tap-target"
          >
            <RefreshCw size={14} className={cn('sm:w-4 sm:h-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sign-In Logs Tab */}
      {activeTab === 'sign-in' && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Method</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP Address</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <div className="flex items-center gap-1"><MapPin size={12} />Location</div>
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : signInLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center italic text-muted-foreground">
                    No sign-in logs found
                  </td>
                </tr>
              ) : (
                signInLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{log.username}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', getStatusBadgeClass(log.status))}>
                        {log.status_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.auth_method_display}</td>
                    <td className="px-4 py-3 text-foreground">
                      <div className="font-mono text-xs" title={log.user_agent || undefined}>{log.ip_address || 'N/A'}</div>
                      {log.user_agent && (
                        <div className="text-xs mt-0.5 truncate max-w-[160px] text-muted-foreground" title={log.user_agent}>
                          <Monitor size={10} className="inline mr-1" />
                          {parseUserAgent(log.user_agent)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground">
                      {log.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-primary" />
                          {log.location}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground">{formatDate(log.timestamp)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{log.failure_reason || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Performed By</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center italic text-muted-foreground">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', getActionBadgeClass(log.action_display))}>
                        {log.action_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.performed_by_display}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
                        {log.action_target_type_display}
                      </span>
                      <div className="text-xs mt-1 text-foreground">{log.action_target}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground">{log.description}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-foreground">{formatDate(log.timestamp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-8">
          {/* Sign-In Stats */}
          <div>
            <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4">Sign-In Statistics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-semibold text-foreground tabular-nums">{stats.sign_in_stats.total}</div>
                <div className="text-xs font-medium text-muted-foreground mt-1">Total Sign-Ins</div>
              </div>
              <div className="bg-primary/5 border border-primary/30 rounded-lg p-4">
                <div className="text-2xl font-semibold text-primary tabular-nums">{stats.sign_in_stats.successful}</div>
                <div className="text-xs font-medium text-primary/80 mt-1">Successful</div>
              </div>
              <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4">
                <div className="text-2xl font-semibold text-destructive tabular-nums">{stats.sign_in_stats.failed}</div>
                <div className="text-xs font-medium text-destructive/80 mt-1">Failed</div>
              </div>
              <div className="bg-accent border border-accent-foreground/20 rounded-lg p-4">
                <div className="text-2xl font-semibold text-accent-foreground tabular-nums">
                  {stats.sign_in_stats.successful > 0
                    ? ((stats.sign_in_stats.successful / stats.sign_in_stats.total) * 100).toFixed(1)
                    : 0}%
                </div>
                <div className="text-xs font-medium text-accent-foreground/80 mt-1">Success Rate</div>
              </div>
            </div>
          </div>

          {/* Auth Methods */}
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Authentication Methods</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
              {Object.entries(stats.sign_in_stats.auth_methods).map(([method, count]) => (
                <div key={method} className="p-3 sm:p-4 bg-muted/40 rounded-lg border border-border">
                  <div className="text-xl sm:text-2xl font-semibold text-foreground tabular-nums">{count}</div>
                  <div className="text-sm font-medium text-muted-foreground capitalize mt-1">{method.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Recent Sign-Ins */}
            <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Recent Sign-Ins</h3>
              <div className="space-y-2">
                {stats.recent_sign_ins.map((log) => (
                  <div key={log.id} className="p-3 bg-muted/30 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{log.username}</span>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', getStatusBadgeClass(log.status))}>
                        {log.status_display}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Audits */}
            <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Recent Audits</h3>
              <div className="space-y-2">
                {stats.recent_audits.map((log) => (
                  <div key={log.id} className="p-3 bg-muted/30 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', getActionBadgeClass(log.action_display))}>
                        {log.action_display}
                      </span>
                    </div>
                    <div className="text-xs text-foreground mt-2 font-medium">
                      {log.performed_by_display}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {log.action_target}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {(activeTab === 'sign-in' || activeTab === 'audit') && (
        <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
          <span>Showing {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0 || loading}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= totalCount || loading}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
