import { useState, useRef } from 'react';
import { X, FileText, Loader2, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiService, MAX_UPLOAD_SIZE_MB } from '@/lib/api';
import { useChatStore } from '@/hooks/useChatStore';
import type { UploadedDocument } from '@/types/chat';

interface DocumentUploadProps {
  className?: string;
  hideChips?: boolean;
}

// Extraction runs async on a Celery worker — poll until it lands so the UI
// (and the Send-button gate in ChatInput) knows when the document's text is
// actually ready to be injected into the LLM prompt, instead of racing it.
const POLL_INTERVAL_MS = 1200;
const MAX_POLL_ATTEMPTS = 60; // ~72s ceiling before giving up silently

async function pollDocumentStatus(docId: number) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (!useChatStore.getState().attachedDocuments.some((d) => d.id === docId)) return; // removed
    try {
      const updated = await apiService.getDocumentStatus(docId);
      useChatStore.getState().updateDocument(docId, updated);
      if (updated.extraction_status === 'completed' || updated.extraction_status === 'failed') return;
    } catch {
      return;
    }
  }
}

export function DocumentUpload({ className, hideChips = false }: DocumentUploadProps) {
  const { attachedDocuments, addDocument, removeDocument } = useChatStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_UPLOAD_SIZE_MB}MB limit`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const doc = await apiService.uploadDocument(file, controller.signal);
      addDocument(doc);
      if (doc.extraction_status === 'pending' || doc.extraction_status === 'processing') {
        pollDocumentStatus(doc.id);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      abortControllerRef.current = null;
      // Reset input so the same file can be selected again
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Attached documents */}
      {!hideChips && attachedDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedDocuments.map((doc) => (
            <DocumentChip key={doc.id} doc={doc} onRemove={() => removeDocument(doc.id)} />
          ))}
        </div>
      )}

      {/* Upload chip — matches ChatInput's mode chips visually, but it's an
          action (opens the file picker) rather than a selectable mode. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (uploading ? handleCancelUpload() : inputRef.current?.click())}
          title={uploading ? 'Cancel upload' : 'Attach a document'}
          aria-label={uploading ? 'Cancel upload' : 'Attach a document'}
          className={cn(
            'flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-[12px] font-medium border transition-all shrink-0',
            uploading
              ? 'bg-destructive/10 text-destructive border-destructive/30'
              : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/40'
          )}
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          ) : (
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="sr-only sm:not-sr-only">Attach</span>
        </button>
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

export function DocumentChip({
  doc,
  onRemove,
}: {
  doc: UploadedDocument;
  onRemove: () => void;
}) {
  const isProcessing = doc.extraction_status === 'pending' || doc.extraction_status === 'processing';
  const isFailed = doc.extraction_status === 'failed';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border border-border/60 rounded-xl text-[12px] w-fit',
        isFailed ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'
      )}
      title={isFailed ? doc.extraction_error || 'Could not read this file' : undefined}
    >
      {isProcessing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <FileText className={cn('w-3.5 h-3.5 shrink-0', isFailed ? 'text-destructive' : 'text-muted-foreground')} />
      )}
      <span className="max-w-[140px] truncate">{doc.original_filename}</span>
      {isProcessing && <span className="text-[11px] text-muted-foreground shrink-0">Reading…</span>}
      {isFailed && <span className="text-[11px] shrink-0">Failed</span>}
      <button
        onClick={onRemove}
        title="Remove file"
        aria-label="Remove file"
        className="tap-target flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
      >
        <X className="w-[11px] h-[11px]" />
      </button>
    </div>
  );
}
