import { ThemeToggle } from '@/components/ThemeToggle';
import { useState, useEffect, useCallback } from 'react';
import { Menu, MessageSquare } from 'lucide-react';
import { ChatSidebar } from './ChatSidebar';
import { ChatWindow } from './ChatWindow';
import { ArtifactPanel } from './ArtifactPanel';
import { UsageBar } from './UsageBar';
import { useChatStore } from '@/hooks/useChatStore';
import { useAuthStore } from '@/hooks/useAuthStore';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { apiService } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Chat } from '@/types/chat';

export function ChatLayout() {
  const { chats, setChats, currentChatId, removeChat, setCurrentChat, setMessages, updateChatTitle } = useChatStore();
  const { username, selectedModel, setSelectedModel, user } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('gini-sidebar-collapsed') === 'true');
  const [isMobile, setIsMobile] = useState(false);

  useEscapeKey(isMobile && isSidebarOpen, () => setIsSidebarOpen(false));
  const mobileDrawerRef = useFocusTrap<HTMLDivElement>(isMobile && isSidebarOpen);

  useEffect(() => {
    loadConversations();
    loadAvailableModels();
  }, []);

  const loadConversations = async () => {
    try {
      const conversations = await apiService.getConversations();
      const formattedChats: Chat[] = conversations.map(conv => ({
        id: conv.id.toString(),
        user_id: 'current-user',
        title: conv.title,
        llm_provider: conv.llm_provider_name,
        llm_provider_name: conv.llm_provider_name,
        llm_provider_display: conv.llm_provider_display,
        llm_provider_type: conv.llm_provider_type,
        chat_mode: conv.chat_mode,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        message_count: conv.message_count,
        is_active: conv.is_active,
        project: conv.project,
      }));
      setChats(formattedChats);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setChats([]);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const models = await apiService.getLLMProviders();
      // A previously-selected model can vanish (deactivated/deleted server-side)
      // while still persisted in this browser — fall back to the default so
      // sending a message doesn't silently target a model that no longer exists.
      const stillValid = models.some((m) => m.name === selectedModel);
      if (!stillValid && models.length > 0) {
        const def = models.find((m) => m.is_default && m.is_active) || models[0];
        setSelectedModel(def.name, def.id);
      }
    } catch (error) {
      console.error('Failed to load available models:', error);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // isSidebarOpen also drives the desktop sidebar's width (not just the
      // mobile drawer) — nothing on the desktop code path ever sets it back
      // to true, so without this, shrinking the window below 768px (closing
      // it) and then growing back past 768px left the sidebar stuck closed
      // with no way to reopen it (the reopen button is mobile-only).
      setIsSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile && currentChatId) setIsSidebarOpen(false);
  }, [currentChatId, isMobile]);

  const toggleSidebarCollapsed = useCallback(() => {
    if (isMobile) { setIsSidebarOpen((v) => !v); return; }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('gini-sidebar-collapsed', String(next));
      return next;
    });
  }, [isMobile]);

  const handleNewChat = useCallback(() => {
    setCurrentChat(null);
    setMessages([]);
    if (isMobile) setIsSidebarOpen(false);
  }, [isMobile]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    try {
      await apiService.deleteConversation(parseInt(chatId));
      removeChat(chatId);
      await loadConversations();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [removeChat]);

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      await apiService.updateConversationTitle(parseInt(chatId), trimmed);
      updateChatTitle(chatId, trimmed);
      await loadConversations();
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  }, [updateChatTitle]);

  const userInfo = {
    name: username || user?.username || 'User',
    email: user?.email || '',
  };
  const currentChat = chats.find(c => c.id === currentChatId);

  useEffect(() => {
    if (currentChatId && currentChat?.llm_provider && selectedModel !== currentChat.llm_provider) {
      setSelectedModel(currentChat.llm_provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);

  // The 68px collapsed-rail state is a desktop-only preference persisted in
  // localStorage — it must never apply on mobile, where the drawer always
  // needs its full width regardless of what was last set on desktop.
  const effectiveCollapsed = isMobile ? false : sidebarCollapsed;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Mobile overlay backdrop */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        ref={isMobile ? mobileDrawerRef : undefined}
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label={isMobile ? 'Sidebar' : undefined}
        tabIndex={isMobile ? -1 : undefined}
        hidden={isMobile && !isSidebarOpen}
        className={cn(
          'h-full transition-all duration-300 ease-in-out z-30',
          isMobile ? 'fixed left-0 top-0' : 'relative',
          isSidebarOpen ? (effectiveCollapsed ? 'w-[68px]' : 'w-[264px]') : 'w-0'
        )}
      >
        <div className={cn(
          'h-full transition-transform duration-300 ease-in-out',
          effectiveCollapsed ? 'w-[68px]' : 'w-[264px]',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <ChatSidebar
            chats={chats}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            user={userInfo}
            hasDocumentConverter={user?.has_document_converter || user?.is_superuser}
            collapsed={effectiveCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
          />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-background">
        {/* Top row — model selector only (web search toggle lives in the composer now) */}
        <div className="workspace-header relative z-10 shrink-0">
          {/* Sidebar re-open trigger — the sidebar auto-closes below the 768px
              breakpoint (real mobile, or a desktop window snapped/grouped
              narrow), and its own collapse toggle lives inside it, so once
              closed there's otherwise no way back in. */}
          {isMobile && !isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open sidebar"
              title="Open sidebar"
              className="mr-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <MessageSquare size={16} className="text-muted-foreground hidden sm:block" />
          <div className="min-w-0"><p className="text-sm font-medium truncate">{currentChat?.title || 'Your workspace'}</p><p className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">{currentChat ? 'Conversation' : 'A fresh space to think'}</p></div>
          <UsageBar />
          <ThemeToggle />
        </div>

        {/* Chat Window */}
        <div className="flex-1 min-h-0">
          <ChatWindow chatId={currentChatId} onConversationsUpdated={loadConversations} />
        </div>
      </main>

      <ArtifactPanel />
    </div>
  );
}
