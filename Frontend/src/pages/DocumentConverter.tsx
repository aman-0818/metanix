import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, Download, FileText, FileSpreadsheet,
  FileImage, Presentation, Trash2, RefreshCw, Check, X,
  Loader2, FileType, AlertCircle, History, Zap, ShieldX,
  ArrowRight,
} from 'lucide-react';
import { apiService, MAX_UPLOAD_SIZE_MB } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LoginPage } from '@/components/auth/LoginPage';
import type { ConversionJob, ConverterFormats, ConverterOutputs } from '@/types/chat';

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const FORMAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pdf:  { bg: 'bg-red-500/10',    text: 'text-red-600',    border: 'border-red-500/30' },
  docx: { bg: 'bg-blue-500/10',   text: 'text-blue-600',   border: 'border-blue-500/30' },
  doc:  { bg: 'bg-blue-500/10',   text: 'text-blue-600',   border: 'border-blue-500/30' },
  xlsx: { bg: 'bg-emerald-500/10',text: 'text-emerald-600',border: 'border-emerald-500/30' },
  xls:  { bg: 'bg-emerald-500/10',text: 'text-emerald-600',border: 'border-emerald-500/30' },
  csv:  { bg: 'bg-emerald-500/10',text: 'text-emerald-600',border: 'border-emerald-500/30' },
  pptx: { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30' },
  ppt:  { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30' },
  png:  { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30' },
  jpg:  { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30' },
  jpeg: { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30' },
  webp: { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30' },
  txt:  { bg: 'bg-slate-500/10',  text: 'text-slate-600',  border: 'border-slate-500/30' },
  html: { bg: 'bg-amber-500/10',  text: 'text-amber-600',  border: 'border-amber-500/30' },
};
const fmtColor = (ext: string) =>
  FORMAT_COLORS[ext.toLowerCase()] ?? { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' };

const CATEGORY_META: Record<string, { icon: any; color: string; label: string }> = {
  documents:     { icon: FileText,        color: 'text-blue-500',    label: 'Documents' },
  spreadsheets:  { icon: FileSpreadsheet, color: 'text-emerald-500', label: 'Spreadsheets' },
  presentations: { icon: Presentation,   color: 'text-orange-500',  label: 'Presentations' },
  images:        { icon: FileImage,       color: 'text-violet-500',  label: 'Images' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentConverter() {
  const navigate     = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const convertAbortRef = useRef<AbortController | null>(null);
  const { isAuthenticated, user, initializeAuth } = useAuthStore();

  useEffect(() => { initializeAuth(); }, [initializeAuth]);

  const [formats, setFormats]               = useState<ConverterFormats | null>(null);
  const [history, setHistory]               = useState<ConversionJob[]>([]);
  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const [availableOutputs, setAvailableOutputs] = useState<ConverterOutputs | null>(null);
  const [targetFormat, setTargetFormat]     = useState<string>('');
  const [quality, setQuality]               = useState<string>('high');
  const [isConverting, setIsConverting]     = useState(false);
  const [error, setError]                   = useState<string>('');
  const [isDragging, setIsDragging]         = useState(false);
  const [showHistory, setShowHistory]       = useState(false);
  const [lastJob, setLastJob]               = useState<ConversionJob | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadFormats = async () => {
    try { const d = await apiService.getConverterFormats(); setFormats(d); }
    catch (e) { console.error(e); }
  };
  const loadHistory = async () => {
    try { const d = await apiService.getConverterHistory(); setHistory(d.conversions); }
    catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (isAuthenticated && (user?.is_superuser || user?.has_document_converter)) {
      loadFormats(); loadHistory();
    }
  }, [isAuthenticated, user]);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file); setError(''); setTargetFormat(''); setLastJob(null); setAvailableOutputs(null);
    if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds the ${MAX_UPLOAD_SIZE_MB}MB upload limit`);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    try {
      const outputs = await apiService.getConverterOutputs(ext);
      setAvailableOutputs(outputs);
      if (outputs.available_outputs['pdf']) setTargetFormat('pdf');
      else { const first = Object.keys(outputs.available_outputs)[0]; if (first) setTargetFormat(first); }
    } catch (err: any) { setError(err.message || 'Unsupported file format'); setAvailableOutputs(null); }
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0]; if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleConvert = async () => {
    if (!selectedFile || !targetFormat) return;
    setIsConverting(true); setError('');

    const controller = new AbortController();
    convertAbortRef.current = controller;

    try {
      const result = await apiService.convertDocument(selectedFile, targetFormat, quality, controller.signal);
      setLastJob(result.job); loadHistory();
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || 'Conversion failed');
    } finally {
      setIsConverting(false);
      convertAbortRef.current = null;
    }
  };

  const handleCancelConvert = () => {
    convertAbortRef.current?.abort();
  };

  const handleDownload = async (job: ConversionJob) => {
    if (!job.output_url) return;
    try {
      const res = await apiService.authFetch(job.output_url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${job.original_filename.split('.')[0]}.${job.target_format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleDelete = async (jobId: number) => {
    try {
      await apiService.deleteConversion(jobId);
      setHistory(p => p.filter(j => j.id !== jobId));
      if (lastJob?.id === jobId) setLastJob(null);
    } catch (e) { console.error(e); }
    setConfirmDeleteId(null);
  };

  const handleReset = () => {
    setSelectedFile(null); setAvailableOutputs(null);
    setTargetFormat(''); setError(''); setLastJob(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const srcColor  = fmtColor(selectedFile?.name.split('.').pop() || '');
  const destColor = fmtColor(targetFormat);

  // ── Auth guards ──────────────────────────────────────────────────────────
  if (!isAuthenticated) return <LoginPage />;

  if (!user?.is_superuser && !user?.has_document_converter) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="surface-card p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold mb-2">Access Denied</h1>
          <p className="text-sm text-muted-foreground mb-6">
            You don't have permission to access the Document Converter. Contact your administrator to request access.
          </p>
          <button onClick={() => navigate('/')}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Return to Chat
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">

      {/* ── Header ── */}
      <header className="h-14 flex items-center px-4 sm:px-6 gap-3 bg-background/95 backdrop-blur-sm border-b border-border/60 sticky top-0 z-10 header-gradient-line">
        <button onClick={() => navigate('/')}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-all hover:scale-105 active:scale-95 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-sm shadow-indigo-500/25 shrink-0">
            <FileType className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight truncate">Document Converter</h1>
            <p className="text-[10px] text-muted-foreground hidden sm:block">Convert any document, any format</p>
          </div>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
            showHistory
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-muted/60 text-muted-foreground border-border/50 hover:text-foreground'
          )}
        >
          <History className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">History</span>
          {history.length > 0 && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
              showHistory ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/30 text-foreground'
            )}>{history.length}</span>
          )}
        </button>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">

        {/* ── Drop Zone ── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden',
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : selectedFile
                ? 'border-border/60 bg-card'
                : 'border-border/60 bg-card hover:border-primary/50 hover:bg-primary/3 cursor-pointer'
          )}
        >
          {!selectedFile ? (
            <label className="flex flex-col items-center justify-center py-14 sm:py-20 cursor-pointer gap-4">
              <input ref={fileInputRef} type="file" className="hidden"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                accept={formats ? Object.keys(formats.input_formats).map(f => `.${f}`).join(',') : undefined}
              />
              <div className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-200',
                'bg-gradient-to-br from-indigo-500/15 to-purple-500/15',
                isDragging && 'scale-110'
              )}>
                <Upload className={cn('w-7 h-7 transition-colors', isDragging ? 'text-primary' : 'text-indigo-500')} />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold mb-1">
                  {isDragging ? 'Drop to upload' : 'Drop your file here'}
                </p>
                <p className="text-sm text-muted-foreground">or <span className="text-primary font-medium underline underline-offset-2">browse from device</span></p>
                <p className="text-xs text-muted-foreground/60 mt-2">PDF · DOCX · XLSX · PPTX · PNG · JPG · and more</p>
              </div>
            </label>
          ) : (
            <div className="p-5">
              <div className="flex items-center gap-4">
                {/* File type badge */}
                <div className={cn('w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0 font-bold text-sm uppercase', srcColor.bg, srcColor.text, srcColor.border)}>
                  .{selectedFile.name.split('.').pop()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-sm">{selectedFile.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{formatBytes(selectedFile.size)}</span>
                    {availableOutputs && <><span>·</span><span className="capitalize">{availableOutputs.category}</span></>}
                  </div>
                </div>
                <button onClick={handleReset}
                  className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-all hover:text-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Conversion Panel ── */}
        {selectedFile && availableOutputs && (
          <div className="surface-card overflow-hidden">

            {/* Convert to header */}
            <div className="px-5 pt-5 pb-4 border-b border-border/40">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Convert to</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(availableOutputs.available_outputs).map(([ext, name]) => {
                  const c = fmtColor(ext);
                  const active = targetFormat === ext;
                  return (
                    <button
                      key={ext}
                      onClick={() => setTargetFormat(ext)}
                      className={cn(
                        'flex items-center gap-2 px-3.5 py-2 rounded-xl border font-semibold text-sm transition-all',
                        active
                          ? `${c.bg} ${c.text} ${c.border} shadow-sm`
                          : 'bg-muted/40 text-muted-foreground border-border/40 hover:border-border hover:text-foreground'
                      )}
                    >
                      <span className={cn('text-xs font-bold uppercase', active ? c.text : 'text-muted-foreground')}>
                        {ext}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{(name as string).split(' ')[0]}</span>
                      {active && <Check className={cn('w-3 h-3', c.text)} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quality row */}
            {formats && (
              <div className="px-5 py-4 border-b border-border/40">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Quality</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(formats.quality_presets).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => setQuality(key)}
                      className={cn(
                        'flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all',
                        quality === key
                          ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                          : 'bg-muted/40 text-muted-foreground border-border/40 hover:border-border hover:text-foreground'
                      )}
                    >
                      <span className="capitalize">{key}</span>
                      <span className="text-xs text-muted-foreground">{preset.dpi} dpi</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview row: source → target */}
            {targetFormat && (
              <div className="px-5 py-4 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold uppercase', srcColor.bg, srcColor.text, srcColor.border)}>
                    <FileType className="w-3.5 h-3.5" />
                    .{selectedFile.name.split('.').pop()}
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="flex-1 h-px bg-gradient-to-r from-border/60 via-primary/30 to-border/60" />
                    <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="flex-1 h-px bg-gradient-to-r from-border/60 via-primary/30 to-border/60" />
                  </div>
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold uppercase', destColor.bg, destColor.text, destColor.border)}>
                    <FileType className="w-3.5 h-3.5" />
                    .{targetFormat}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 my-3 flex items-center gap-3 p-3 rounded-xl bg-destructive/8 border border-destructive/25 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
                <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Convert button + progress */}
            <div className="p-5 space-y-3">
              {isConverting && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Converting… this may take a moment</span>
                    <button
                      onClick={handleCancelConvert}
                      className="text-destructive hover:underline font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden relative" role="progressbar" aria-label="Converting" aria-busy="true">
                    <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-indigo-500 to-primary progress-indeterminate" />
                  </div>
                </div>
              )}
              <button
                onClick={handleConvert}
                disabled={!targetFormat || isConverting}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all',
                  isConverting
                    ? 'bg-primary/60 text-primary-foreground cursor-wait'
                    : targetFormat
                      ? 'bg-gradient-to-r from-indigo-500 to-primary text-white hover:opacity-90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {isConverting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Converting…</>
                ) : (
                  <><Zap className="w-4 h-4" />Convert{targetFormat ? ` to ${targetFormat.toUpperCase()}` : ''}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Success download card ── */}
        {lastJob?.status === 'completed' && (
          <div className="bg-card border border-emerald-500/30 rounded-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/8 border-b border-emerald-500/20">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Conversion complete!</p>
                <p className="text-xs text-muted-foreground">Your file is ready to download</p>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/40 mb-4">
                <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 font-bold text-xs uppercase', destColor.bg, destColor.text, destColor.border)}>
                  .{lastJob.target_format}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {lastJob.original_filename.split('.')[0]}.{lastJob.target_format}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {lastJob.output_file_size && <span>{formatBytes(lastJob.output_file_size)}</span>}
                    {lastJob.output_file_size && lastJob.file_size && (
                      <>
                        <span>·</span>
                        <span className={lastJob.output_file_size < lastJob.file_size ? 'text-emerald-500' : 'text-muted-foreground'}>
                          {lastJob.output_file_size < lastJob.file_size
                            ? `↓ ${Math.round((1 - lastJob.output_file_size / lastJob.file_size) * 100)}% smaller`
                            : `↑ ${Math.round((lastJob.output_file_size / lastJob.file_size - 1) * 100)}% larger`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(lastJob)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/25"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl border border-border bg-muted/40 text-muted-foreground text-sm font-medium hover:text-foreground transition-colors"
                >
                  Convert another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error (no file selected) ── */}
        {error && !selectedFile && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/8 border border-destructive/25 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Supported formats summary ── */}
        {!selectedFile && formats && (
          <div className="surface-card p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Supported Formats</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(formats.output_formats).map(([category, fmts]) => {
                const meta = CATEGORY_META[category] ?? { icon: FileType, color: 'text-primary', label: category };
                const Icon = meta.icon;
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('w-3.5 h-3.5', meta.color)} />
                      <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(fmts).map(ext => {
                        const c = fmtColor(ext);
                        return (
                          <span key={ext} className={cn('text-[10px] px-1.5 py-0.5 rounded-md border font-bold uppercase', c.bg, c.text, c.border)}>
                            {ext}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── History panel ── */}
        {showHistory && (
          <div className="surface-card overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Recent Conversions</span>
                {history.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{history.length}</span>
                )}
              </div>
              <button onClick={loadHistory} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {history.length === 0 ? (
              <div className="py-12 text-center">
                <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No conversions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto scrollbar-thin">
                {history.map(job => {
                  const sc = fmtColor(job.original_format);
                  const dc = fmtColor(job.target_format);
                  return (
                    <div key={job.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group">
                      {/* Format pill */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border', sc.bg, sc.text, sc.border)}>
                          {job.original_format}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                        <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border', dc.bg, dc.text, dc.border)}>
                          {job.target_format}
                        </span>
                      </div>
                      {/* File name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.original_filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {/* Status */}
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', {
                        'bg-emerald-500/10 text-emerald-600': job.status === 'completed',
                        'bg-destructive/10 text-destructive': job.status === 'failed',
                        'bg-blue-500/10 text-blue-600': job.status === 'processing',
                        'bg-muted text-muted-foreground': !['completed','failed','processing'].includes(job.status),
                      })}>
                        {job.status}
                      </span>
                      {/* Actions */}
                      {confirmDeleteId === job.id ? (
                        <div className="flex items-center gap-2 shrink-0 animate-scale-in">
                          <span className="text-xs text-destructive font-medium">Delete?</span>
                          <button
                            onClick={() => handleDelete(job.id)}
                            className="px-2 py-1 text-[10px] font-semibold rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {job.status === 'completed' && job.output_url && (
                            <button onClick={() => handleDownload(job)}
                              className="w-7 h-7 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 text-muted-foreground flex items-center justify-center transition-colors">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setConfirmDeleteId(job.id)}
                            className="w-7 h-7 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
