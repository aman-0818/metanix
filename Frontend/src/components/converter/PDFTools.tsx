import { useEffect, useState } from 'react';
import { apiService } from '@/lib/api';
import { Merge, Scissors, Minimize2, RotateCw, ArrowUpDown, Stamp, ListOrdered, Lock, Unlock, ScanText, Files } from 'lucide-react';

type Job = { id: number; original_filename: string; target_format: string; status: string;
  error_message: string; progress: number; progress_stage: string; output_url?: string };
const operations = { merge: 'Merge PDFs', split: 'Split into pages', compress: 'Compress PDF',
  rotate: 'Rotate pages', reorder: 'Reorder / extract pages', watermark: 'Add watermark',
  number_pages: 'Number pages', add_password: 'Add password', remove_password: 'Remove password',
  ocr: 'OCR to searchable PDF', convert: 'Batch format conversion' };
const icons = { merge: Merge, split: Scissors, compress: Minimize2, rotate: RotateCw,
  reorder: ArrowUpDown, watermark: Stamp, number_pages: ListOrdered, add_password: Lock,
  remove_password: Unlock, ocr: ScanText, convert: Files };

export function PDFTools({ maxUploadMB = 25, acceptedInputs = [], selectedFile }: { maxUploadMB?: number; acceptedInputs?: string[]; selectedFile?: File | null }) {
  const [operation, setOperation] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, string>>({ angle: '90', target_format: 'pdf' });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = jobs.some(j => ['pending', 'processing'].includes(j.status));
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const next = await Promise.all(jobs.map(job => apiService.request<Job>(`/admin/converter/${job.id}/status/`)));
        if (active) setJobs(next);
      } catch { if (active) setError('Unable to check progress. Retrying shortly.'); }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [jobs, pending]);
  const move = (from: number, to: number) => setFiles(previous => {
    const next = [...previous]; const [file] = next.splice(from, 1); next.splice(to, 0, file); return next;
  });
  const submit = async () => {
    if (files.length > 20 || files.some(file => file.size > maxUploadMB * 1024 * 1024)) {
      setError(`Choose up to 20 files, each no larger than ${maxUploadMB} MB.`); return;
    }
    setBusy(true); setError('');
    try {
      const body = new FormData(); files.forEach(file => body.append('files', file));
      Object.entries({ ...options, operation }).forEach(([key, value]) => body.append(key, value));
      const result = await apiService.multipart<{jobs: Job[]}>('/admin/converter/operations/', body);
      setJobs(result.jobs); setOptions(prev => ({...prev, input_password: '', output_password: ''}));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start operation.'); }
    finally { setBusy(false); }
  };
  const download = async (job: Job) => {
    setError('');
    try {
      const url = URL.createObjectURL(await apiService.downloadConversion(job.id));
      const link = document.createElement('a'); link.href = url;
      link.download = `${job.original_filename.replace(/\.[^.]+$/, '')}.${job.target_format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); }
  };
  const field = (key: string, label: string, type = 'text') => <label key={key} className="block text-sm">{label}<input type={type} autoComplete="off"
    className="block border rounded p-2 bg-background w-full" value={options[key] || ''} onChange={e => setOptions(prev => ({...prev, [key]: e.target.value}))} /></label>;
  return <section aria-labelledby="pdf-tools-heading" className="border rounded-2xl bg-card p-5 sm:p-6">
    <h2 id="pdf-tools-heading" className="text-lg font-semibold">PDF tools & batch conversion</h2>
    <p className="text-sm text-muted-foreground mt-1 mb-5">Choose a tool to organize, protect, or edit your documents.</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {Object.entries(operations).map(([value, label]) => {
        const Icon = icons[value];
        return <button key={value} type="button" aria-pressed={operation === value}
          aria-controls="pdf-tool-options" disabled={busy || pending}
          onClick={() => {
            setOperation(value); setError('');
            const candidates = files.length ? files : selectedFile ? [selectedFile] : [];
            const compatible = value === 'convert' ? candidates : candidates.filter(file => /\.pdf$/i.test(file.name));
            setFiles(['merge', 'convert'].includes(value) ? compatible : compatible.slice(0, 1));
          }}
          className={`flex items-center gap-2.5 text-left text-sm font-medium rounded-xl border p-3 min-h-14 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${operation === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent hover:border-primary/40'}`}>
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />{label}
        </button>;
      })}
    </div>
    {operation && <div id="pdf-tool-options" className="space-y-4 mt-5 border-t pt-5">
      <h3 className="font-semibold">{operations[operation]}</h3>
      {operation === 'split' && <p className="text-sm text-muted-foreground">Save each selected page as a separate PDF in a ZIP download.</p>}
      {operation === 'remove_password' && <p className="text-sm text-muted-foreground">Enter the current password to save an unlocked copy of your PDF.</p>}
      <p className="text-sm text-muted-foreground">Up to 20 files, {maxUploadMB} MB each. PDF jobs allow up to 300 pages; OCR allows up to 50 pages. Large batches may need separate uploads.</p>
      <label className="block text-sm font-medium">{files.length && ['merge','convert'].includes(operation) ? 'Add more files' : 'Choose files'}
        <input key={operation} className="block mt-2 w-full text-sm" aria-label="Files for operation" type="file" disabled={busy || pending} multiple={['merge','convert'].includes(operation)} accept={operation === 'convert' ? acceptedInputs.map(ext => `.${ext}`).join(',') : '.pdf'} onChange={e => {
          const added = Array.from(e.target.files || []);
          setFiles(previous => ['merge', 'convert'].includes(operation) ? [...previous, ...added] : added);
          e.target.value = '';
        }} />
      </label>
      {files.map((file, index) => <div key={`${file.name}-${index}`} draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(index))}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from) && from >= 0 && from < files.length) move(from, index); }}
        className="flex gap-3 items-center text-sm border rounded p-2"><span className="flex-1">{index+1}. {file.name}</span>
        <button disabled={!index || busy || pending} onClick={() => move(index, index-1)}>Move up</button>
        <button disabled={busy || pending} aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, position) => position !== index))}>Remove</button></div>)}
      {['split','rotate','reorder','watermark','number_pages'].includes(operation) && field('pages', 'Pages (e.g. 1,3,5-8; blank for all)')}
      {operation === 'watermark' && field('text', 'Watermark text')}
      {operation === 'rotate' && field('angle', 'Rotation (90, 180 or 270)', 'number')}
      {operation === 'convert' && field('target_format', 'Output format (pdf, docx, txt, md, html, xlsx or csv)')}
      {operation !== 'convert' && field('input_password', 'Input password (if protected)', 'password')}
      {operation === 'add_password' && field('output_password', 'New password (8–40 characters)', 'password')}
      <button disabled={busy || pending || !files.length || (operation === 'merge' && files.length < 2)} onClick={submit} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">{busy ? 'Uploading…' : pending ? 'Processing…' : operations[operation]}</button>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {jobs.map(job => <div key={job.id} className="border rounded p-3 space-y-2"><p className="text-sm">{job.original_filename} · {job.progress_stage}</p>
        <progress className="w-full" value={job.progress} max={100} aria-label={`${job.original_filename} progress`} />
        {job.error_message && <p className="text-destructive text-sm">{job.error_message}</p>}
        {job.output_url && <button onClick={() => download(job)} className="text-primary">Download {job.target_format.toUpperCase()}</button>}
      </div>)}
    </div>}
  </section>;
}
