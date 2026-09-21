import { Brand } from '@/components/Brand';
import { cn } from '@/lib/utils';
import type { Message, ExportFileType } from '@/types/chat';
import { FileDown, Download, Palette, Lightbulb, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';
import { memo, useState, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { apiService } from '@/lib/api';
import { useChatStore } from '@/hooks/useChatStore';
import { THEME_COLORS } from '@/lib/messageThemes';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

const RETHEME_LIST = Object.entries(THEME_COLORS).map(([id, v]) => ({ id, label: v.label, bg: v.bg, accent: v.accent }));

const EXPORT_FILE_LABELS: Record<string, string> = {
  docx: 'Word Document (.docx)',
  pdf: 'PDF (.pdf)',
  xlsx: 'Excel Spreadsheet (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
  csv: 'CSV (.csv)',
  md: 'Markdown (.md)',
};

// Explicit "Export as..." menu — the guaranteed-to-work counterpart to
// phrase detection ("give me this as a pdf"). ChatGPT/Claude/Gemini all
// give you a button for this rather than relying purely on parsing what you
// typed; the phrase-based path stays as a shortcut for people who prefer it.
const EXPORT_MENU_ITEMS: { format: ExportFileType; label: string }[] = [
  { format: 'docx', label: 'Word (.docx)' },
  { format: 'pdf', label: 'PDF (.pdf)' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'pptx', label: 'PowerPoint (.pptx)' },
  { format: 'csv', label: 'CSV (.csv)' },
  { format: 'md', label: 'Markdown (.md)' },
];

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser      = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [copied, setCopied] = useState(false);
  const [showRetheme, setShowRetheme] = useState(false);
  const [rethemeLoading, setRethemeLoading] = useState(false);
  const [rethemeError, setRethemeError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [localPptxUrl, setLocalPptxUrl] = useState<string | undefined>(message.pptx_url);
  const [localTheme, setLocalTheme] = useState<string | undefined>(message.pptx_theme);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFileType | null>(null);
  const [exportMenuError, setExportMenuError] = useState<string | null>(null);
  const { updateMessage } = useChatStore();

  // message.pptx_url arrives later than mount when generation is still
  // processing (ChatWindow's pollPptxStatus updates the store once the async
  // render finishes) — localPptxUrl's own setters (retheme/export) only cover
  // in-component actions, so re-sync from the prop whenever it changes too.
  useEffect(() => {
    setLocalPptxUrl(message.pptx_url);
    setLocalTheme(message.pptx_theme);
  }, [message.pptx_url, message.pptx_theme]);

  // Historical messages already carry the real backend id as `message.id`;
  // a reply that just finished streaming hasn't learned it yet (see
  // ChatWindow's pollExportStatus) — the button stays disabled until then.
  const realMessageId = /^\d+$/.test(message.id) ? parseInt(message.id, 10) : message.realMessageId;

  const handleExport = async (format: ExportFileType) => {
    if (!realMessageId) return;
    setShowExportMenu(false);
    setExportingFormat(format);
    setExportMenuError(null);
    try {
      const result = await apiService.exportMessage(realMessageId, format);
      updateMessage(message.id, {
        export_file_url: result.export_file_url,
        export_file_type: result.export_file_type,
      });
    } catch {
      setExportMenuError('Export failed — please try again.');
      setTimeout(() => setExportMenuError(null), 4000);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleRetheme = async (themeId: string) => {
    const msgDbId = parseInt(message.id);
    if (isNaN(msgDbId)) return;
    setRethemeLoading(true);
    setRethemeError(null);
    setShowRetheme(false);
    try {
      const result = await apiService.retheme(msgDbId, themeId);
      setLocalPptxUrl(result.pptx_url);
      setLocalTheme(result.pptx_theme);
      updateMessage(message.id, { pptx_url: result.pptx_url, pptx_theme: result.pptx_theme });
    } catch {
      setRethemeError('Failed to change theme — please try again.');
      setTimeout(() => setRethemeError(null), 4000);
    } finally {
      setRethemeLoading(false);
    }
  };

  if (message.role === 'system') return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Copy failed');
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isPresentationMsg = isAssistant && (!!localPptxUrl || message.pptx_status != null);
  const displayContent = isPresentationMsg
    ? cleanPresentationContent(message.content, !!localPptxUrl)
    : message.content;

  const themeInfo = localTheme ? THEME_COLORS[localTheme] : null;

  /* ── User message ─────────────────────────────────────────────── */
  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up group/message">
        <div className="max-w-[78%]">
          <div className="user-bubble rounded-[18px_18px_4px_18px] px-[17px] py-[13px]">
            <p className="text-[15.5px] leading-[1.6] whitespace-pre-wrap break-words">{message.content}</p>
          </div>
          <div className={cn('flex justify-end items-center gap-2 mt-1 px-1 transition-opacity duration-150', copyError ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 focus-within:opacity-100')}>
            {copyError && <span className="text-[10px] text-destructive">{copyError}</span>}
            <span className="text-[10px] text-muted-foreground">{formattedTime}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Assistant message — card surface, matching the ChatGPT/Copilot/Claude
       convention of visually distinguishing AI responses from the page
       background rather than leaving them as bare floating text. Reuses
       .surface-card (already the app's one shared "premium card" recipe)
       instead of inventing a new visual language. ─── */
  return (
    <div className="flex justify-start items-start animate-slide-up group/message">
      <div className="w-full min-w-0 pb-1">
        <div className="assistant-message">
          <div className="flex items-center gap-2 mb-3"><Brand compact className="[&_img]:w-6 [&_img]:h-6" /><span className="text-xs font-semibold">Metanix</span>{isStreaming && <span className="text-[10px] text-muted-foreground" role="status">Writing…</span>}</div>
          <div className="ai-response">
            <MarkdownRenderer content={displayContent} isStreaming={isStreaming} />
            {isStreaming && isAssistant && (
              <span className="inline-block w-0.5 h-[0.9em] ml-0.5 bg-primary/60 typing-cursor rounded-full align-middle" />
            )}
          </div>
        </div>

        {/* PPTX still rendering on the Celery task (pollPptxStatus in ChatWindow) */}
        {isAssistant && message.pptx_status === 'processing' && !localPptxUrl && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Rendering your presentation…
          </div>
        )}
        {isAssistant && message.pptx_status === 'failed' && !localPptxUrl && (
          <div className="mt-3 text-xs text-destructive">
            Presentation generation failed — please try again.
          </div>
        )}

        {/* File export (Word/PDF/Excel) — requested mid-conversation, e.g. "give me this as a word doc" */}
        {message.exportPending && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Preparing your file…
          </div>
        )}
        {message.export_file_url && (
          <div className="mt-3">
            <a
              href={message.export_file_url}
              download
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <FileDown className="w-4 h-4" />
              Download {EXPORT_FILE_LABELS[message.export_file_type ?? 'docx']}
            </a>
          </div>
        )}

        {/* PPTX Download */}
        {localPptxUrl && (
          <div className="mt-4 pt-3 border-t border-border/30 space-y-3">
            {/* Theme badge + retheme */}
            <div className="flex items-center gap-2 flex-wrap">
              {themeInfo && (
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-accent text-accent-foreground">
                    {themeInfo.label}
                  </span>
                </div>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowRetheme(v => !v)}
                  disabled={rethemeLoading}
                  aria-haspopup="listbox"
                  aria-expanded={showRetheme}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  <RefreshCw className={cn('w-3 h-3', rethemeLoading && 'animate-spin')} />
                  {rethemeLoading ? 'Applying…' : 'Change theme'}
                </button>
                {rethemeError && (
                  <span className="text-[11px] text-destructive">{rethemeError}</span>
                )}
                {showRetheme && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowRetheme(false)} />
                    <div role="listbox" aria-label="Pick a theme" className="absolute left-0 top-full mt-1.5 z-20 bg-popover border border-border/60 rounded-2xl shadow-xl p-2 w-56 animate-scale-in">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">Pick a theme</p>
                      <div className="grid grid-cols-2 gap-1">
                        {RETHEME_LIST.map((t) => {
                          const isLight = t.bg.startsWith('#F') || t.bg.startsWith('#E');
                          return (
                            <button
                              key={t.id}
                              role="option"
                              aria-selected={localTheme === t.id}
                              onClick={() => handleRetheme(t.id)}
                              className={cn(
                                'flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-medium border border-transparent hover:border-border/60 transition-all',
                                localTheme === t.id && 'border-primary/40 bg-primary/5'
                              )}
                              style={{ background: t.bg }}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.accent }} />
                              <span style={{ color: isLight ? '#1E293B' : '#fff' }}>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <a
              href={localPptxUrl}
              download
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              <FileDown className="w-4 h-4" />
              Download Presentation (.pptx)
            </a>
            {message.style_suggestions && message.style_suggestions.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Style suggestions</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {message.style_suggestions.map((s, i) => (
                    <span key={i} className="text-xs px-3 py-1.5 rounded-lg bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-default">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hover action row */}
        {!isStreaming && (
          <div className={cn(
            'flex items-center gap-1 mt-2 transition-opacity duration-150',
            (copyError || showExportMenu || exportingFormat || exportMenuError) ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 focus-within:opacity-100'
          )}>
            <span className="text-[10px] text-muted-foreground mr-1">{formattedTime}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              aria-label="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={!realMessageId || !!exportingFormat}
                title={!realMessageId ? 'Preparing…' : 'Export as...'}
                aria-haspopup="menu"
                aria-expanded={showExportMenu}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exportingFormat ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {exportingFormat ? 'Exporting…' : 'Export as...'}
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div role="menu" aria-label="Export as" className="absolute left-0 bottom-full mb-1.5 z-20 bg-popover border border-border/60 rounded-2xl shadow-xl p-1.5 w-52 animate-scale-in">
                    {EXPORT_MENU_ITEMS.map((item) => (
                      <button
                        key={item.format}
                        role="menuitem"
                        onClick={() => handleExport(item.format)}
                        className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-foreground/80 hover:bg-muted/60 hover:text-foreground transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {copyError && <span className="text-[11px] text-destructive">{copyError}</span>}
            {exportMenuError && <span className="text-[11px] text-destructive">{exportMenuError}</span>}
          </div>
        )}
      </div>
    </div>
  );
});

function cleanPresentationContent(content: string, ready: boolean): string {
  const cleaned = content.replace(/```json[\s\S]*?```/g, '').trim();
  if (cleaned.length > 20) return cleaned;
  try {
    const jsonMatch = content.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const slides = data.slides || data;
      if (Array.isArray(slides)) {
        const titles = slides.map((s: any) => s.title).filter(Boolean).slice(0, 6);
        const theme = data.theme ? `Theme: **${data.theme}**\n\n` : '';
        const heading = ready ? '✨ **Your presentation is ready!**' : '⏳ **Building your presentation…**';
        const footer = ready
          ? 'Click the button below to download your .pptx file.'
          : 'Rendering the .pptx file — the download button will appear here shortly.';
        return `${heading}\n\n${theme}**${slides.length} beautifully designed slides** generated:\n${titles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}${slides.length > 6 ? `\n... and ${slides.length - 6} more` : ''}\n\n${footer}`;
      }
    }
  } catch { /* ignore */ }
  return content;
}
