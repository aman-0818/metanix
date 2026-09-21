import { useEffect, useState } from 'react';
import { apiService } from '@/lib/api';
import type { LLMProvider } from '@/types/chat';

export function ProviderContextSettings({ providers }: { providers: LLMProvider[] }) {
  const [id, setId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [web, setWeb] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = providers.find(p => String(p.id) === id);
  useEffect(() => {
    const config = selected?.extra_config || {};
    setValues(Object.fromEntries(['context_window', 'context_max_messages', 'context_token_budget'].map(key => [key, config[key] ? String(config[key]) : ''])));
    setWeb(config.web_search === true); setMessage('');
  }, [selected]);
  const save = async () => {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const config = { ...selected.extra_config, web_search: web };
      for (const [key, value] of Object.entries(values)) {
        if (!value) { delete config[key]; continue; }
        if (!Number.isInteger(Number(value)) || Number(value) < 1) throw new Error('Enter positive whole numbers.');
        config[key] = Number(value);
      }
      await apiService.updateLLMProvider(selected.id, { extra_config: config });
      setMessage('Saved. New requests use these settings.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save settings.'); }
    finally { setBusy(false); }
  };
  return <details className="rounded-xl border p-4"><summary className="font-medium cursor-pointer">Context limits & live web search</summary>
    <div className="mt-4 space-y-3">
      <label className="block text-sm">Model<select className="block border rounded p-2 bg-background w-full" value={id} onChange={e => setId(e.target.value)}>
        <option value="">Choose a model</option>{providers.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
      </select></label>
      {selected && <>
        {[['context_window', 'Model context window (tokens)'], ['context_max_messages', 'Maximum history messages (2–200)'], ['context_token_budget', 'History token budget']].map(([key, label]) =>
          <label key={key} className="block text-sm">{label}<input type="number" min={1} className="block border rounded p-2 bg-background w-full" value={values[key] || ''} placeholder="Use deployment default" onChange={e => setValues(prev => ({...prev, [key]: e.target.value}))} /></label>)}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={web} onChange={e => setWeb(e.target.checked)} />Allow live web search for this model</label>
        <p className="text-xs text-muted-foreground">Larger context and web searches can increase usage costs. Web search also requires the deployment search service to be enabled.</p>
        <button disabled={busy} className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm" onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button>
      </>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>
  </details>;
}
