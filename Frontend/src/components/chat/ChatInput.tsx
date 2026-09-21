import { useState, useRef, useEffect } from 'react';
import { Square, MessageSquare, Code2, Presentation as PresentationIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentUpload, DocumentChip } from './DocumentUpload';
import { PresentationControls } from './PresentationControls';
import { useChatStore } from '@/hooks/useChatStore';
import { ModelPicker } from './ModelPicker';
import type { ChatMode } from '@/types/chat';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  showStop?: boolean;
  isWaiting?: boolean;
  placeholder?: string;
  /** 'floating' = centered empty-state composer (max-w 680px); 'docked' = fixed bottom bar during a conversation */
  variant?: 'floating' | 'docked';
}

// 'document' isn't a manually-selectable mode — attaching a file already
// auto-switches into it (see the attachedDocuments effect below), so a
// separate "Document Q&A" chip was redundant with plain General.
const SINGLE_MODES: { mode: ChatMode; label: string; icon: typeof MessageSquare }[] = [
  { mode: 'general', label: 'Chat', icon: MessageSquare },
  { mode: 'code', label: 'Code', icon: Code2 },
  { mode: 'knowledge', label: 'Company knowledge', icon: MessageSquare },
  { mode: 'presentation', label: 'Presentation', icon: PresentationIcon },
];

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  showStop = false,
  isWaiting = false,
  placeholder = 'Ask Metanix anything, or bring a file…',
  variant = 'docked',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    chatMode, setChatMode, attachedDocuments, removeDocument, pendingPrompt, setPendingPrompt,
  } = useChatStore();

  useEffect(() => {
    if (pendingPrompt !== null) {
      setMessage(pendingPrompt);
      setPendingPrompt(null);
      textareaRef.current?.focus();
    }
  }, [pendingPrompt, setPendingPrompt]);

  // A document is still being extracted server-side (Celery, async) — sending
  // now would silently reach the LLM with no document context at all, since
  // the backend only injects text once extraction_status is 'completed'.
  const hasPendingDocuments = attachedDocuments.some(
    (d) => d.extraction_status === 'pending' || d.extraction_status === 'processing'
  );
  const canSend = message.trim().length > 0 && !disabled && !showStop && !hasPendingDocuments;

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled && !showStop && !hasPendingDocuments) {
      onSend(trimmed);
      setMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [message]);

  useEffect(() => {
    if (attachedDocuments.length > 0 && chatMode !== 'document') {
      setChatMode('document');
    }
  }, [attachedDocuments.length]);

  const isFloating = variant === 'floating';

  return (
    <div className={cn(!isFloating && 'px-4 sm:px-7 safe-bottom')}>
      <div className={cn('mx-auto', isFloating ? 'w-full' : 'max-w-[850px]')}>

        <div
          className={cn(
            'workspace-composer',
            disabled ? 'opacity-60 border-border/40' : 'border-border focus-within:border-primary/40'
          )}
        >
          <textarea
            aria-label="Message Metanix"
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed min-h-[54px] max-h-[160px]',
              isFloating ? 'text-base' : 'text-[15.5px]'
            )}
          />

          {attachedDocuments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachedDocuments.map((doc) => (
                <DocumentChip key={doc.id} doc={doc} onRemove={() => removeDocument(doc.id)} />
              ))}
            </div>
          )}

          {chatMode === 'presentation' && <div className="my-3"><p className="text-xs text-primary mb-2 font-medium">Presentation studio · Describe your topic to create a downloadable deck</p><PresentationControls /></div>}

          <div className="flex items-end justify-between mt-2.5 gap-2">
            {/* Mode chips — always visible, directly selectable (no dropdown).
                Upload sits in the same row since it's the other composer-wide
                action, but it triggers a file picker rather than a mode. */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <DocumentUpload hideChips />
              {SINGLE_MODES.map(({ mode, label, icon: Icon }) => {
                const isActive = chatMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    aria-pressed={isActive}
                    title={label}
                    className={cn(
                      'flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-[12px] font-medium border transition-all shrink-0',
                      isActive
                        ? 'bg-accent text-accent-foreground border-transparent'
                        : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-muted/40'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className={mode === 'code' ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
                  </button>
                );
              })}
            </div>

            {showStop ? (
              <button
                onClick={onStop}
                disabled={!onStop}
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
                title="Stop generation"
                aria-label="Stop generation"
              >
                {isWaiting ? (
                  <span className="w-4 h-4 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className={cn(
                  'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                  canSend ? 'bg-primary text-primary-foreground cursor-pointer' : 'bg-muted text-muted-foreground cursor-default'
                )}
                title={hasPendingDocuments ? 'Waiting for document to finish processing…' : 'Send message (Enter)'}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="6 11 12 5 18 11" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/60 mt-3 pt-2 gap-2"><ModelPicker /><span className="hidden sm:block text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line</span></div>
        </div>

      </div>
    </div>
  );
}
