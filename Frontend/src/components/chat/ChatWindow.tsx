import { useEffect, useRef, useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useChatStore } from '@/hooks/useChatStore';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ChatInput } from './ChatInput';
import { EmptyChat } from './EmptyChat';
import { apiService } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuthStore';
import type { Message } from '@/types/chat';

interface ChatWindowProps {
  chatId: string | null;
  onConversationsUpdated?: () => Promise<void>;
}

// The streaming SSE 'done' event fires before the assistant's Message row
// even exists (it's created moments later by an async Celery task, so the
// response isn't delayed by a DB round-trip) — so there's no message id to
// poll by yet. Poll by conversation instead: the backend just returns the
// latest assistant message's export fields, which is exactly the one this
// poll started for.
//
// This poll now always runs after every streamed reply (not just ones with
// an auto-detected export_format) because it doubles as how the frontend
// learns the message's REAL numeric id — needed so the explicit "Export
// as..." button works on a reply the instant it finishes streaming, instead
// of only after a page reload reconciles ids from conversation history.
const EXPORT_POLL_INTERVAL_MS = 1200;
const EXPORT_POLL_MAX_ATTEMPTS = 30; // ~36s ceiling — export completion only; id usually lands in one tick

async function pollExportStatus(
  conversationId: number,
  localMessageId: string,
  isStale: () => boolean,
  awaitExportResult: boolean
) {
  const { updateMessage } = useChatStore.getState();
  let learnedId = false;
  for (let attempt = 0; attempt < EXPORT_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, EXPORT_POLL_INTERVAL_MS));
    if (isStale()) return;
    try {
      const status = await apiService.getConversationExportStatus(conversationId);
      if (!learnedId && status.message_id) {
        updateMessage(localMessageId, { realMessageId: status.message_id });
        learnedId = true;
        if (!awaitExportResult) return; // only needed the id — done
      }
      if (awaitExportResult && (status.export_status === 'completed' || status.export_status === 'failed')) {
        updateMessage(localMessageId, {
          exportPending: false,
          export_file_url: status.export_file_url,
          export_file_type: status.export_file_type,
        });
        return;
      }
    } catch {
      return;
    }
  }
  if (awaitExportResult) updateMessage(localMessageId, { exportPending: false });
}

// Presentation mode's ai_content JSON parses fine in the same synchronous
// request, but the actual .pptx file renders on a Celery task enqueued right
// after — pptx_status comes back 'processing' with pptx_url still null.
// Poll by message id (already known here, unlike the streamed export path).
const PPTX_POLL_INTERVAL_MS = 1200;
const PPTX_POLL_MAX_ATTEMPTS = 30; // ~36s ceiling

async function pollPptxStatus(messageId: number, localMessageId: string, isStale: () => boolean) {
  const { updateMessage } = useChatStore.getState();
  for (let attempt = 0; attempt < PPTX_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, PPTX_POLL_INTERVAL_MS));
    if (isStale()) return;
    try {
      const status = await apiService.getPptxStatus(messageId);
      if (status.pptx_status === 'completed' || status.pptx_status === 'failed') {
        updateMessage(localMessageId, {
          pptx_status: status.pptx_status,
          pptx_url: status.pptx_url || undefined,
          pptx_theme: status.pptx_theme || undefined,
          style_suggestions: status.style_suggestions || undefined,
        });
        return;
      }
    } catch {
      return;
    }
  }
  updateMessage(localMessageId, { pptx_status: 'failed' });
}

export function ChatWindow({ chatId, onConversationsUpdated }: ChatWindowProps) {
  const {
    messages,
    setMessages,
    addMessage,
    streamingStatus,
    setStreamingStatus,
    streamingContent,
    setStreamingContent,
    appendStreamingContent,
    chatMode,
    setChatMode,
    attachedDocuments,
    clearDocuments,
    presentationTheme,
    slideCount,
    activeProjectId,
  } = useChatStore();

  const [hasSummary, setHasSummary] = useState(false);
  const [stillWorking, setStillWorking] = useState(false);
  const [searchActivity, setSearchActivity] = useState('');
  useEffect(() => { if (streamingStatus === 'idle') setSearchActivity(''); }, [streamingStatus]);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const stillWorkingTimeoutRef = useRef<number | null>(null);

  const { selectedModel, selectedModelId } = useAuthStore();

  const messagesEndRef     = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef      = useRef(true);
  const cleanupRef         = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTimeoutRef   = useRef<number | null>(null);
  const stopRequestedRef   = useRef(false);
  // Set right before setCurrentChat() when a brand-new conversation's id
  // comes back from the first send — we already have the full message
  // state locally at that point. Without this, the [chatId] effect below
  // treats it like switching to a different chat and re-fetches from the
  // backend, which can race the backend's own persistence of the reply
  // that was just streamed and silently wipe it from the UI.
  const skipNextLoadRef   = useRef(false);

  // Client-side reveal smoothing. The upstream LLM API doesn't flush one
  // token at a time — it batches ~20-40 tokens per network write (confirmed
  // via direct server-side timing: dozens of tokens arriving within ~1ms of
  // each other, then a genuine ~100ms+ gap before the next batch). Rendering
  // streamingContent directly means the UI pastes in a full sentence at
  // once, which reads as "not streaming" even though the app is behaving
  // correctly. This reveals the already-buffered text at a smooth, adaptive
  // pace instead — the same technique ChatGPT/Claude's own web UIs use,
  // since this is a fact of life with most LLM streaming APIs, not a bug.
  const [displayedLen, setDisplayedLen] = useState(0);
  const streamingContentRef = useRef('');

  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // ── Scroll helpers ─────────────────────────────────────────────────
  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 120;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

  // Auto-scroll while streaming — only if user is at bottom
  useEffect(() => {
    if (streamingContent && isAtBottomRef.current) {
      scrollToBottom(true);
    }
  }, [streamingContent, scrollToBottom]);

  // Keep the ref in sync for the reveal loop below (which intentionally
  // doesn't depend on streamingContent directly — see that effect). Also
  // resets the reveal position whenever content is cleared, regardless of
  // which of the many call sites cleared it (new message, error, stop, or
  // switching chats).
  useEffect(() => {
    streamingContentRef.current = streamingContent;
    if (streamingContent === '') setDisplayedLen(0);
  }, [streamingContent]);

  // Adaptive reveal: steps displayedLen toward the real buffer length every
  // frame. Step size scales with how far behind we are, so a 30-token burst
  // gets spread over a couple hundred ms (looks like typing) while a long
  // response still catches up instead of permanently lagging.
  useEffect(() => {
    if (streamingStatus !== 'streaming') return;
    // setTimeout, not requestAnimationFrame — rAF is tied to the browser
    // actually compositing a frame for this tab, which some embedding
    // contexts (or a backgrounded/inactive tab) never do, silently stalling
    // the whole reveal. A fixed timer has no such dependency.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setDisplayedLen((prev) => {
        const target = streamingContentRef.current.length;
        if (prev >= target) return prev;
        const gap = target - prev;
        const step = Math.max(1, Math.ceil(gap / 6));
        return Math.min(target, prev + step);
      });
      timer = setTimeout(tick, 30);
    };
    timer = setTimeout(tick, 30);
    return () => clearTimeout(timer);
  }, [streamingStatus]);

  // Scroll when a committed message is added
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      isAtBottomRef.current = true;
      setShowScrollBtn(false);
      scrollToBottom();
    } else if (isAtBottomRef.current) {
      scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Load messages when chat changes
  useEffect(() => {
    if (chatId) {
      if (skipNextLoadRef.current) {
        skipNextLoadRef.current = false;
      } else {
        loadConversation(chatId);
      }
    } else {
      setMessages([]);
      setHasSummary(false);
    }
    setStreamingStatus('idle');
    setStreamingContent('');
    setLastFailedMessage(null);
    isAtBottomRef.current = true;
    setShowScrollBtn(false);

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    return () => { if (cleanupRef.current) cleanupRef.current(); };
  }, []);

  const loadConversation = async (conversationId: string) => {
    try {
      const conversation = await apiService.getConversation(parseInt(conversationId));
      const formattedMessages: Message[] = conversation.messages.map((msg: any) => ({
        id: msg.id.toString(),
        chat_id: conversationId,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        created_at: msg.created_at,
        token_count: msg.token_count,
        pptx_url: msg.pptx_url || undefined,
        pptx_theme: msg.pptx_theme || undefined,
        style_suggestions: msg.style_suggestions || undefined,
      }));
      setMessages(formattedMessages);
      setChatMode(conversation.chat_mode);
      setHasSummary(conversation.has_summary);
      setTimeout(() => scrollToBottom(true), 50);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setMessages([]);
      setHasSummary(false);
    }
  };

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedModel) return;

      isAtBottomRef.current = true;
      setShowScrollBtn(false);
      scrollToBottom();

      const currentChatId = chatId;
      // Snapshot the chat session — bumped by setCurrentChat/removeChat whenever the user
      // navigates away from this chat (including a null → null "New chat" click, which
      // React's [chatId] effect can't see). Callbacks below check this before writing.
      const sessionId = useChatStore.getState().chatSessionId;
      const isStale = () => useChatStore.getState().chatSessionId !== sessionId;
      setLastFailedMessage(null);
      if (stillWorkingTimeoutRef.current) { clearTimeout(stillWorkingTimeoutRef.current); stillWorkingTimeoutRef.current = null; }
      setStillWorking(false);
      stillWorkingTimeoutRef.current = window.setTimeout(() => setStillWorking(true), 18000);
      stopRequestedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        chat_id: currentChatId || 'new',
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      };

      addMessage(userMessage);
      setStreamingStatus('waiting');
      setStreamingContent('');

      const documentIds = attachedDocuments.map((d) => d.id);
      const opts = {
        conversationId: currentChatId ? parseInt(currentChatId) : undefined,
        projectId: !currentChatId && activeProjectId ? activeProjectId : undefined,
        llmProviderId: selectedModelId ?? undefined,
        llmProvider: selectedModel,
        chatMode,
        documentIds: documentIds.length > 0 ? documentIds : undefined,
        presentationTheme: chatMode === 'presentation' ? presentationTheme : undefined,
        slideCount: chatMode === 'presentation' ? slideCount : undefined,
      };

      if (chatMode === 'presentation') {
        try {
          const response = await apiService.sendChatMessage(content, opts, abortController.signal);
          if (stillWorkingTimeoutRef.current) { clearTimeout(stillWorkingTimeoutRef.current); stillWorkingTimeoutRef.current = null; }
          setStillWorking(false);
          if (isStale()) return; // user navigated away from this chat while the request was in flight
          if (documentIds.length > 0) clearDocuments();
          if (!currentChatId) {
            skipNextLoadRef.current = true;
            useChatStore.getState().setCurrentChat(response.conversation_id.toString());
            if (onConversationsUpdated) await onConversationsUpdated().catch(console.error);
          }
          const localId = response.message_id?.toString() ?? `ai-${Date.now()}`;
          addMessage({
            id: localId,
            chat_id: response.conversation_id.toString(),
            role: 'assistant',
            content: response.response,
            created_at: new Date().toISOString(),
            token_count: response.token_count,
            pptx_url: response.pptx_url || undefined,
            style_suggestions: response.style_suggestions || undefined,
            pptx_theme: response.pptx_theme || undefined,
            pptx_status: response.pptx_status || undefined,
          });
          if (response.pptx_status === 'processing' && response.message_id) {
            // Snapshot chatSessionId now, not at send-time: for a brand-new
            // conversation, setCurrentChat() just above bumped it, which would
            // make the outer isStale() report "stale" on this poll's very
            // first check before it ever got a chance to run (same trap as
            // pollExportStatus above).
            const pollSessionId = useChatStore.getState().chatSessionId;
            pollPptxStatus(
              response.message_id,
              localId,
              () => useChatStore.getState().chatSessionId !== pollSessionId
            );
          }
          setStreamingStatus('idle');
          setStreamingContent('');
        } catch (error) {
          if (stillWorkingTimeoutRef.current) { clearTimeout(stillWorkingTimeoutRef.current); stillWorkingTimeoutRef.current = null; }
          setStillWorking(false);
          if (abortController.signal.aborted || isStale()) { setStreamingStatus('idle'); setStreamingContent(''); return; }
          setStreamingStatus('idle');
          setStreamingContent('');
          setLastFailedMessage(content);
          addMessage({
            id: `error-${Date.now()}`,
            chat_id: currentChatId || 'new',
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response.'}`,
            created_at: new Date().toISOString(),
          });
        }
        return;
      }

      const firstTokenRef = { received: false };

      const clearStillWorkingTimeout = () => {
        if (stillWorkingTimeoutRef.current) {
          clearTimeout(stillWorkingTimeoutRef.current);
          stillWorkingTimeoutRef.current = null;
        }
        setStillWorking(false);
      };

      const clearStreamTimeout = () => {
        if (streamTimeoutRef.current) {
          clearTimeout(streamTimeoutRef.current);
          streamTimeoutRef.current = null;
        }
        clearStillWorkingTimeout();
      };

      // Timeout: agar 60 seconds mein pehla token na aaye → abort
      streamTimeoutRef.current = window.setTimeout(() => {
        if (!firstTokenRef.received) {
          abortController.abort();
          clearStillWorkingTimeout();
          setStreamingStatus('idle');
          setStreamingContent('');
          setLastFailedMessage(content);
          addMessage({
            id: `error-${Date.now()}`,
            chat_id: currentChatId || 'new',
            role: 'assistant',
            content: 'Error: Request timed out. The server took too long to respond.',
            created_at: new Date().toISOString(),
          });
        }
      }, 60000);

      try {
        await apiService.streamChatMessage(
          content,
          opts,
          {
            onToken: (token) => {
              if (stopRequestedRef.current || abortController.signal.aborted || isStale()) return;
              if (!firstTokenRef.received) {
                firstTokenRef.received = true;
                // First token received — clear the timeout
                clearStreamTimeout();
                setStreamingStatus('streaming');
              }
              appendStreamingContent(token);
            },
            onSearch: (searching, error) => {
              if (!isStale()) setSearchActivity(searching ? 'Searching the web…' : error || 'Web sources found');
            },
            onDone: async (data) => {
              clearStreamTimeout();
              if (isStale()) return;
              if (data.title) {
                useChatStore.getState().updateChatTitle(data.conversation_id.toString(), data.title);
              }
              const finalContent = useChatStore.getState().streamingContent;
              const aiMessageId = `ai-${Date.now()}`;
              addMessage({
                id: aiMessageId,
                chat_id: data.conversation_id.toString(),
                role: 'assistant',
                content: finalContent,
                created_at: new Date().toISOString(),
                token_count: data.token_count,
                exportPending: !!data.export_format,
              });
              setStreamingStatus('idle');
              setStreamingContent('');
              if (documentIds.length > 0) clearDocuments();
              if (!currentChatId) {
                skipNextLoadRef.current = true;
                useChatStore.getState().setCurrentChat(data.conversation_id.toString());
                if (onConversationsUpdated) await onConversationsUpdated().catch(console.error);
              }
              // Always poll — even with no export_format, this is how the
              // message learns its real numeric id (see pollExportStatus's
              // comment) so the "Export as..." button works immediately.
              // Snapshot chatSessionId now, not at send-time: for a brand-new
              // conversation, setCurrentChat() just above bumped it, which
              // would make the outer isStale() report "stale" on this poll's
              // very first check before it ever got a chance to run.
              const pollSessionId = useChatStore.getState().chatSessionId;
              pollExportStatus(
                data.conversation_id,
                aiMessageId,
                () => useChatStore.getState().chatSessionId !== pollSessionId,
                !!data.export_format
              );
            },
            onError: (err) => {
              clearStreamTimeout();
              if (isStale()) return;
              setStreamingStatus('idle');
              setStreamingContent('');
              setLastFailedMessage(content);
              addMessage({
                id: `error-${Date.now()}`,
                chat_id: currentChatId || 'new',
                role: 'assistant',
                content: `Error: ${err}`,
                created_at: new Date().toISOString(),
              });
            },
          },
          abortController.signal
        );

        if (!isStale() && !firstTokenRef.received) setStreamingStatus('idle');
      } catch (error) {
        if (abortController.signal.aborted || isStale()) { setStreamingStatus('idle'); setStreamingContent(''); return; }
        setStreamingStatus('idle');
        setStreamingContent('');
        setLastFailedMessage(content);
        addMessage({
          id: `error-${Date.now()}`,
          chat_id: currentChatId || 'new',
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response.'}`,
          created_at: new Date().toISOString(),
        });
      } finally {
        clearStreamTimeout();
      }
    },
    [
      chatId, selectedModel, selectedModelId, chatMode, attachedDocuments,
      addMessage, setStreamingStatus, setStreamingContent, appendStreamingContent,
      clearDocuments, onConversationsUpdated, scrollToBottom,
    ]
  );

  const handleStop = useCallback(() => {
    stopRequestedRef.current = true;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null; }
    if (stillWorkingTimeoutRef.current) { clearTimeout(stillWorkingTimeoutRef.current); stillWorkingTimeoutRef.current = null; }
    setStillWorking(false);

    // Save whatever was streamed so far — don't discard partial response
    const partial = useChatStore.getState().streamingContent;
    if (partial && partial.trim()) {
      addMessage({
        id: `ai-${Date.now()}`,
        chat_id: chatId ?? 'new',
        role: 'assistant',
        content: partial,
        created_at: new Date().toISOString(),
      });
    }

    setStreamingStatus('idle');
    setStreamingContent('');
  }, [chatId, addMessage, setStreamingStatus, setStreamingContent]);

  cleanupRef.current = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (streamTimeoutRef.current) { clearTimeout(streamTimeoutRef.current); streamTimeoutRef.current = null; }
    if (stillWorkingTimeoutRef.current) { clearTimeout(stillWorkingTimeoutRef.current); stillWorkingTimeoutRef.current = null; }
    setStreamingStatus('idle');
    setStreamingContent('');
  };

  const isInputDisabled = streamingStatus !== 'idle';
  const showThinking    = streamingStatus === 'waiting';
  const showStreaming   = streamingStatus === 'streaming' && streamingContent;
  const isEmpty         = messages.length === 0 && !showThinking && !showStreaming;

  if (isEmpty) {
    return (
      <div className="flex flex-col h-full bg-background relative overflow-y-auto scrollbar-thin">
        <EmptyChat
          onSend={handleSendMessage}
          onStop={handleStop}
          showStop={isInputDisabled}
          isWaiting={showThinking}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="max-w-[850px] mx-auto px-4 sm:px-7 pt-6 pb-5 flex flex-col gap-7">
          {hasSummary && (
            <p className="text-xs text-muted-foreground text-center -mb-2">
              Earlier messages in this conversation were condensed to save space — full history is still saved.
            </p>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {showThinking && <ThinkingIndicator stillWorking={stillWorking} />}
          {searchActivity && <p role="status" className="text-sm text-muted-foreground">{searchActivity}</p>}

          {showStreaming && (
            <MessageBubble
              message={{
                id: 'streaming',
                chat_id: chatId ?? 'new',
                role: 'assistant',
                content: streamingContent.slice(0, displayedLen),
                created_at: new Date().toISOString(),
              }}
              isStreaming
            />
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>

      {/* Floating scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => { isAtBottomRef.current = true; setShowScrollBtn(false); scrollToBottom(); }}
          className="absolute bottom-24 right-4 sm:right-6 z-20 w-9 h-9 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all animate-scale-in"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {lastFailedMessage && !isInputDisabled && (
        <div className="max-w-[850px] w-full mx-auto px-7 pb-2 flex items-center justify-center gap-3 text-sm">
          <span className="text-destructive">Message failed to send.</span>
          <button
            onClick={() => { const msg = lastFailedMessage; setLastFailedMessage(null); handleSendMessage(msg); }}
            className="font-semibold text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput
        variant="docked"
        onSend={handleSendMessage}
        onStop={handleStop}
        showStop={isInputDisabled}
        disabled={false}
        isWaiting={showThinking}
        placeholder="Continue the conversation…"
      />
    </div>
  );
}
