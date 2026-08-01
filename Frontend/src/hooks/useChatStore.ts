import { create } from 'zustand';
import type { Chat, Message, StreamingStatus, ChatMode, UploadedDocument } from '@/types/chat';

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  /** Bumped whenever the active chat is switched/cleared — lets an in-flight stream's
   *  callbacks detect they belong to a chat the user has already navigated away from. */
  chatSessionId: number;
  messages: Message[];
  streamingStatus: StreamingStatus;
  streamingContent: string;
  chatMode: ChatMode;
  attachedDocuments: UploadedDocument[];
  presentationTheme: string;
  slideCount: number;
  activeProjectId: number | null;
  pendingPrompt: string | null;
  artifact: { code: string; language: string } | null;

  // Actions
  setChats: (chats: Chat[]) => void;
  setCurrentChat: (chatId: string | null) => void;
  setActiveProjectId: (projectId: number | null) => void;
  setPendingPrompt: (text: string | null) => void;
  openArtifact: (artifact: { code: string; language: string }) => void;
  closeArtifact: () => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  setStreamingStatus: (status: StreamingStatus) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  createChat: (chat: Chat) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  removeChat: (chatId: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setPresentationTheme: (theme: string) => void;
  setSlideCount: (count: number) => void;
  addDocument: (doc: UploadedDocument) => void;
  updateDocument: (docId: number, updates: Partial<UploadedDocument>) => void;
  removeDocument: (docId: number) => void;
  clearDocuments: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  currentChatId: null,
  chatSessionId: 0,
  messages: [],
  streamingStatus: 'idle',
  streamingContent: '',
  chatMode: 'general',
  attachedDocuments: [],
  presentationTheme: '',
  // 0 = unset — AI decides how many slides the topic actually needs, same
  // "no selection" convention as presentationTheme above.
  slideCount: 0,
  activeProjectId: null,
  pendingPrompt: null,
  artifact: null,

  setChats: (chats) => set({ chats }),

  setCurrentChat: (chatId) =>
    set((state) => ({
      currentChatId: chatId,
      chatSessionId: state.chatSessionId + 1,
      streamingStatus: 'idle',
      streamingContent: '',
    })),

  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  setPendingPrompt: (text) => set({ pendingPrompt: text }),
  openArtifact: (artifact) => set({ artifact }),
  closeArtifact: () => set({ artifact: null }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setStreamingStatus: (status) => set({ streamingStatus: status }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),

  createChat: (chat) =>
    set((state) => ({
      chats: [chat, ...state.chats],
      currentChatId: chat.id,
    })),

  updateChatTitle: (chatId, title) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
    })),

  removeChat: (chatId) =>
    set((state) => {
      const wasCurrent = state.currentChatId === chatId;
      return {
        chats: state.chats.filter((c) => c.id !== chatId),
        currentChatId: wasCurrent ? null : state.currentChatId,
        chatSessionId: wasCurrent ? state.chatSessionId + 1 : state.chatSessionId,
        messages: wasCurrent ? [] : state.messages,
      };
    }),

  updateMessage: (messageId, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => m.id === messageId ? { ...m, ...updates } : m),
    })),

  setChatMode: (mode) => set({ chatMode: mode }),
  setPresentationTheme: (theme) => set({ presentationTheme: theme }),
  setSlideCount: (count) => set({ slideCount: count }),

  addDocument: (doc) =>
    set((state) => ({
      attachedDocuments: [...state.attachedDocuments, doc],
    })),

  updateDocument: (docId, updates) =>
    set((state) => ({
      attachedDocuments: state.attachedDocuments.map((d) =>
        d.id === docId ? { ...d, ...updates } : d
      ),
    })),

  removeDocument: (docId) =>
    set((state) => ({
      attachedDocuments: state.attachedDocuments.filter((d) => d.id !== docId),
    })),

  clearDocuments: () => set({ attachedDocuments: [] }),
}));
