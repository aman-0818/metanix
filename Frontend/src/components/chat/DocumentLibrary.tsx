import { useAuthStore } from '@/hooks/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FileText, Search, Loader2, Check, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { apiService } from '@/lib/api';
import { useChatStore } from '@/hooks/useChatStore';
import { DocumentUpload } from './DocumentUpload';

export function DocumentLibrary({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const userId = useAuthStore(state => state.user?.id);
  const { attachedDocuments, addDocument, setPendingPrompt } = useChatStore();
  const {
    data: documents = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['workspace-documents', userId],
    queryFn: () => apiService.getDocuments(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const filtered = documents.filter((d) =>
    d.original_filename.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <span className="eyebrow mb-2">WORKSPACE</span>
          <DialogTitle>Your documents</DialogTitle>
          <DialogDescription>
            Bring your files into the conversation. Select a ready document to work with it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-3 text-muted-foreground" />
            <input
              aria-label="Search documents"
              className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm"
              placeholder="Find a document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DocumentUpload hideChips />
        </div>
        <p className="text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV and XLSX</p>
        <div className="max-h-[50dvh] overflow-y-auto scrollbar-thin space-y-2">
          {isLoading ? (
            <p
              className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 size={16} className="animate-spin" />
              Loading documents…
            </p>
          ) : isError ? (
            <div role="alert" className="py-8 text-center text-sm">
              <p className="text-destructive mb-3">We couldn't load your documents.</p>
              <button onClick={() => refetch()} className="text-primary underline">
                Try again
              </button>
            </div>
          ) : !filtered.length ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">
                {search ? 'No matching documents' : 'Good ideas start with good context.'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {search
                  ? 'Try another filename.'
                  : 'Upload your first document to explore it with Metanix.'}
              </p>
            </div>
          ) : (
            filtered.map((doc) => {
              const attached = attachedDocuments.some((d) => d.id === doc.id);
              const ready = doc.extraction_status === 'completed';
              return (
                <button
                  key={doc.id}
                  disabled={!ready}
                  onClick={() => {
                    if (!attached) addDocument(doc);
                    setPendingPrompt('Summarize the key insights from this document.');
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center gap-3 p-3.5 border rounded-xl text-left bg-card hover:border-primary/40 disabled:cursor-default disabled:opacity-70 transition-colors"
                >
                  <span className="p-2.5 bg-secondary rounded-lg text-primary">
                    <FileText size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {doc.original_filename}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      {Math.max(1, Math.round(doc.file_size / 1024))} KB ·{' '}
                      {ready
                        ? 'Ready to explore'
                        : doc.extraction_status === 'failed'
                          ? 'Processing failed — upload again'
                          : 'Reading document…'}
                    </span>
                  </span>
                  {attached ? (
                    <Check size={16} className="text-primary" />
                  ) : ready ? (
                    <ArrowUpRight size={16} className="text-muted-foreground" />
                  ) : doc.extraction_status !== 'failed' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
