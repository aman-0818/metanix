import { useEffect, useState } from 'react';
import { apiService } from '@/lib/api';

type KnowledgeDocument = {
  id: number; title: string; version: number; status: string; error: string;
  chunk_count: number; allowed_roles: string[]; allowed_users: number[];
};

export function KnowledgeManager() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState('restricted');
  const [users, setUsers] = useState('');
  const refresh = async () => setDocuments(await apiService.request<KnowledgeDocument[]>('/admin/knowledge/'));
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiService.request<KnowledgeDocument[]>('/admin/knowledge/');
        if (active) setDocuments(data);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load knowledge documents.'); }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const scope = () => {
    const ids = users.split(',').map(v => v.trim()).filter(Boolean).map(Number);
    if (ids.some(id => !Number.isInteger(id) || id < 1)) throw new Error('Enter user IDs separated by commas.');
    return { allowed_roles: audience === 'everyone' ? ['user', 'admin'] : ['admin'], allowed_users: ids };
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-6">
    <div><h2 className="text-xl font-semibold">Company knowledge</h2>
      <p className="text-sm text-muted-foreground">Upload policies and reference documents. Employees can ask questions using Company knowledge in chat.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="rounded-xl border p-4 space-y-4">
      <label className="block text-sm">Access for new uploads or “Apply access”
        <select className="block mt-2 rounded border bg-background p-2" value={audience} onChange={e => setAudience(e.target.value)}>
          <option value="restricted">Administrators and selected users</option><option value="everyone">All employees</option>
        </select></label>
      <label className="block text-sm">Additional user IDs, separated by commas
        <input className="block mt-2 rounded border bg-background p-2 w-full" value={users} onChange={e => setUsers(e.target.value)} placeholder="12, 34" /></label>
      <label className="block text-sm">Upload up to 20 documents
        <input className="block mt-2" type="file" multiple disabled={busy} accept=".pdf,.docx,.txt,.md,.csv,.xlsx" onChange={e => {
          const files = Array.from(e.target.files || []); e.target.value = '';
          if (files.length) void run(async () => {
            const body = new FormData(); files.forEach(f => body.append('files', f));
            Object.entries(scope()).forEach(([key, value]) => body.append(key, JSON.stringify(value)));
            await apiService.multipart('/admin/knowledge/', body);
          });
        }} /></label>
    </div>
    {!documents.length && <p className="text-muted-foreground">No knowledge documents have been uploaded.</p>}
    {documents.map(doc => <article key={doc.id} className="rounded-xl border p-4 space-y-3">
      <div className="flex justify-between gap-4"><h3 className="font-medium">{doc.title} · v{doc.version}</h3><span role="status">{doc.status} · {doc.chunk_count} passages</span></div>
      <p className="text-sm text-muted-foreground">Access: {doc.allowed_roles.includes('user') ? 'All employees' : 'Administrators'}{doc.allowed_users.length > 0 ? `; users ${doc.allowed_users.join(', ')}` : ''}</p>
      {doc.error && <p className="text-sm text-destructive">{doc.error}</p>}
      <div className="flex flex-wrap gap-4 text-sm">
        <button disabled={busy} onClick={() => void run(() => apiService.request(`/admin/knowledge/${doc.id}/`, { method: 'PATCH', body: JSON.stringify(scope()) }))}>Apply access</button>
        <label>Replace file <input type="file" disabled={busy} accept=".pdf,.docx,.txt,.md,.csv,.xlsx" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (file) void run(() => { const body = new FormData(); body.append('file', file); return apiService.multipart(`/admin/knowledge/${doc.id}/`, body, 'PATCH'); });
        }} /></label>
        <button className="text-destructive" disabled={busy} onClick={() => {
          if (window.confirm(`Delete ${doc.title} from company knowledge?`)) void run(() => apiService.request(`/admin/knowledge/${doc.id}/`, { method: 'DELETE' }));
        }}>Delete</button>
      </div>
    </article>)}
  </section>;
}
