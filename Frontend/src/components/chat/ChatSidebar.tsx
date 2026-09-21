import { Brand } from '@/components/Brand';
import { DocumentLibrary } from './DocumentLibrary';
import { Plus, MessageSquare, Search, Trash2, Pencil, Check, X, FileType, PanelLeft, Folder, LogOut, ShieldCheck, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/hooks/useChatStore';
import { useAuthStore } from '@/hooks/useAuthStore';
import { apiService } from '@/lib/api';
import { cn, getInitials } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import type { Chat, Project } from '@/types/chat';
import { getProviderLogo } from '@/lib/providerVisuals';

interface ChatSidebarProps {
  chats: Chat[];
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  user: { name: string; email: string };
  hasDocumentConverter?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function groupChatsByDate(chats: Chat[]) {
  const now = new Date();
  const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek     = new Date(startOfToday.getTime() - 6 * 86400000);

  const groups: { label: string; chats: Chat[] }[] = [
    { label: 'Today',           chats: [] },
    { label: 'Yesterday',       chats: [] },
    { label: 'Previous 7 Days', chats: [] },
    { label: 'Older',           chats: [] },
  ];

  for (const chat of chats) {
    const updated = new Date(chat.updated_at);
    if      (updated >= startOfToday)     groups[0].chats.push(chat);
    else if (updated >= startOfYesterday) groups[1].chats.push(chat);
    else if (updated >= startOfWeek)      groups[2].chats.push(chat);
    else                                  groups[3].chats.push(chat);
  }

  return groups.filter((g) => g.chats.length > 0);
}

export function ChatSidebar({ chats, onNewChat, onDeleteChat, onRenameChat, user, hasDocumentConverter, collapsed, onToggleCollapsed }: ChatSidebarProps) {
  const { currentChatId, setCurrentChat, activeProjectId, setActiveProjectId } = useChatStore();
  const { user: authUser, logout } = useAuthStore();
  const isAdmin = authUser?.role === 'admin' || authUser?.is_superuser || authUser?.is_staff;
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const navigate = useNavigate();
  const [searchQuery,    setSearchQuery]   = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingChatId,  setEditingChatId]  = useState<string | null>(null);
  const [editingTitle,   setEditingTitle]   = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<number | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const isSubmittingProjectRef = useRef(false);

  const flashProjectError = (msg: string) => {
    setProjectError(msg);
    setTimeout(() => setProjectError(null), 4000);
  };

  useEffect(() => {
    apiService.getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (editingChatId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChatId]);

  const filteredByProject = activeProjectId
    ? chats.filter((chat) => chat.project === activeProjectId)
    : chats;
  const filteredChats = filteredByProject.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groups = searchQuery
    ? [{ label: 'Results', chats: filteredChats }]
    : groupChatsByDate(filteredChats);

  const startRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const commitRename = (chatId: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== chats.find(c => c.id === chatId)?.title) {
      onRenameChat(chatId, trimmed);
    }
    setEditingChatId(null);
  };

  const cancelRename = () => {
    setEditingChatId(null);
  };

  const startDelete = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(null);
    setConfirmDeleteId(chatId);
  };

  const confirmDelete = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteChat(chatId);
    setConfirmDeleteId(null);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  const submitNewProject = async () => {
    if (isSubmittingProjectRef.current) return;
    const name = newProjectName.trim();
    if (!name) { setAddingProject(false); return; }
    isSubmittingProjectRef.current = true;
    try {
      const project = await apiService.createProject(name);
      setProjects((prev) => [project, ...prev]);
    } catch {
      flashProjectError('Failed to create project');
    } finally {
      isSubmittingProjectRef.current = false;
    }
    setNewProjectName('');
    setAddingProject(false);
  };

  const selectProject = (id: number) => {
    setActiveProjectId(activeProjectId === id ? null : id);
  };

  const handleDeleteProject = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiService.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeProjectId === id) setActiveProjectId(null);
    } catch {
      flashProjectError('Failed to delete project');
    }
    setConfirmDeleteProjectId(null);
  };

  return (
    <aside aria-label="Workspace navigation" className="flex flex-col h-full bg-sidebar text-sidebar-foreground overflow-hidden border-r border-sidebar-border/70">
      {/* Header */}
      <div className={cn('relative flex items-center h-[76px] shrink-0', collapsed ? 'px-3 justify-center' : 'pl-5 pr-[18px]')}>
        {!collapsed && (
          <Brand />
        )}
        <button
          onClick={onToggleCollapsed}
          className={cn(
            'p-1.5 rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0',
            !collapsed && 'absolute right-[18px]'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      <div className={cn('pb-4', collapsed ? 'px-3' : 'px-3.5')}>
        <button
          onClick={onNewChat}
          className={cn(
            'w-full flex items-center justify-center gap-2.5 rounded-lg bg-foreground text-background font-semibold text-sm transition-all hover:bg-primary hover:text-primary-foreground active:scale-[0.98] ',
            collapsed ? 'px-0 py-2.5' : 'px-3.5 py-2.5'
          )}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span>New chat</span>}
        </button>

        {!collapsed && <p className="eyebrow mt-7 mb-2 px-3">Workspace</p>}
        <button onClick={() => setDocumentsOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sidebar-muted text-[13px] hover:bg-sidebar-accent hover:text-foreground" title="Documents" aria-label="Documents"><FileText size={15} className="shrink-0" />{!collapsed && 'Documents'}</button>
        <DocumentLibrary open={documentsOpen} onOpenChange={setDocumentsOpen} />
        {hasDocumentConverter && (
          <button
            onClick={() => navigate('/converter')}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 mt-1 rounded-lg text-sidebar-muted text-[13px] font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground"
            title="Document Converter"
          >
            <FileType className="w-3.5 h-3.5" />
            {!collapsed && <span className="truncate">Converter</span>}
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2.5 mt-1 rounded-lg text-sidebar-muted text-[13px] font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground',
              collapsed && 'px-0'
            )}
            title="Control center"
            aria-label="Control center"
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span className="truncate">Control center</span>}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-muted" />
            <input
              type="text"
              aria-label="Search conversations"
              placeholder="Search conversations…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background/60 border border-sidebar-border/70 rounded-lg placeholder:text-sidebar-muted focus:outline-none focus:ring-1 focus:ring-sidebar-ring transition-all"
            />
          </div>
        </div>
      )}

      {/* Scrollable nav */}
      <div className={cn('flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-5', collapsed ? 'px-2 pb-3' : 'px-2.5 pb-3')}>
        {!collapsed && (
          <>
            {/* Projects */}
            <div>
              <div className="flex items-center justify-between px-1.5 pb-2">
                <span className="text-[11px] font-semibold text-sidebar-muted uppercase tracking-wider">Projects</span>
                <button
                  onClick={() => setAddingProject(true)}
                  className="p-0.5 text-sidebar-muted hover:text-sidebar-foreground transition-colors"
                  aria-label="Add project"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className={cn(
                      'group w-full flex items-center gap-1 rounded-lg pl-2.5 pr-1 py-2 text-[13.5px] transition-colors',
                      activeProjectId === proj.id ? 'sidebar-active-item' : 'hover:bg-sidebar-accent/70 text-sidebar-foreground'
                    )}
                  >
                    {confirmDeleteProjectId === proj.id ? (
                      <div className="flex-1 flex items-center gap-2 animate-scale-in">
                        <span className="flex-1 text-xs text-destructive font-medium">Delete this project?</span>
                        <button
                          onClick={(e) => handleDeleteProject(proj.id, e)}
                          className="px-2 py-1 text-[10px] font-semibold rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteProjectId(null); }}
                          className="p-1 rounded-md hover:bg-sidebar-border/50 transition-colors text-sidebar-muted"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => selectProject(proj.id)}
                          className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                        >
                          <Folder className="w-3.5 h-3.5 shrink-0 text-sidebar-muted" />
                          <span className="truncate">{proj.name}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteProjectId(proj.id); }}
                          className="p-1.5 rounded-lg text-sidebar-muted opacity-0 group-hover:opacity-100 focus-within:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                          aria-label="Delete project"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {addingProject && (
                  <div className="flex items-center gap-1 px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitNewProject(); if (e.key === 'Escape') setAddingProject(false); }}
                      onBlur={submitNewProject}
                      placeholder="Project name…"
                      className="flex-1 text-sm bg-background border border-sidebar-ring rounded-md px-2 py-1 focus:outline-none min-w-0"
                    />
                  </div>
                )}
                {projects.length === 0 && !addingProject && !projectError && (
                  <p className="px-2.5 py-1 text-xs text-sidebar-muted">No projects yet</p>
                )}
                {projectError && (
                  <p className="px-2.5 py-1 text-xs text-destructive">{projectError}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Recents */}
        <div>
          {!collapsed && (
            <p className="px-1.5 pb-2 text-[11px] font-semibold text-sidebar-muted uppercase tracking-wider">Recents</p>
          )}
          {filteredChats.length === 0 ? (
            !collapsed && (
              <div className="flex flex-col items-center justify-center py-8 text-sidebar-muted">
                <MessageSquare className="w-7 h-7 mb-2 opacity-30" />
                <p className="text-sm font-medium">{searchQuery ? 'No matches found' : 'No chats yet'}</p>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.label}>
                  {!collapsed && (
                    <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-muted">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {group.chats.map((chat) => {
                      const isActive   = currentChatId === chat.id;
                      const isEditing  = editingChatId === chat.id;
                      const isConfirm  = confirmDeleteId === chat.id;
                      const logo       = getProviderLogo(chat.llm_provider_type);

                      if (collapsed) {
                        return (
                          <button
                            key={chat.id}
                            onClick={() => setCurrentChat(chat.id)}
                            title={chat.title}
                            className={cn(
                              'w-full flex items-center justify-center py-2.5 rounded-lg transition-all',
                              isActive ? 'sidebar-active-item' : 'hover:bg-sidebar-accent/60'
                            )}
                          >
                            {logo ? (
                              <img src={logo.src} alt={logo.alt} className="w-4 h-4 object-contain" />
                            ) : (
                              <MessageSquare className={cn('w-4 h-4', isActive ? 'text-sidebar-primary' : 'text-sidebar-muted')} />
                            )}
                          </button>
                        );
                      }

                      return (
                        <div
                          key={chat.id}
                          className={cn(
                            'w-full text-left py-2.5 px-2.5 rounded-lg transition-all group cursor-pointer',
                            isActive ? 'sidebar-active-item' : 'hover:bg-sidebar-accent/60 text-sidebar-foreground'
                          )}
                        >
                          {/* Delete confirmation inline */}
                          {isConfirm ? (
                            <div className="flex items-center gap-2 animate-scale-in">
                              <span className="flex-1 text-xs text-destructive font-medium">Delete this chat?</span>
                              <button
                                onClick={(e) => confirmDelete(chat.id, e)}
                                className="px-2 py-1 text-[10px] font-semibold rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={cancelDelete}
                                className="p-1 rounded-md hover:bg-sidebar-border/50 transition-colors text-sidebar-muted"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2.5">
                              {logo ? (
                                <img
                                  src={logo.src}
                                  alt={logo.alt}
                                  className={cn('w-4 h-4 mt-0.5 shrink-0 object-contain', !isActive && 'opacity-60')}
                                />
                              ) : (
                                <MessageSquare className={cn('w-4 h-4 mt-0.5 shrink-0', isActive ? 'text-sidebar-primary' : 'text-sidebar-muted')} />
                              )}

                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      ref={editInputRef}
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename(chat.id);
                                        if (e.key === 'Escape') cancelRename();
                                      }}
                                      className="flex-1 text-sm bg-background border border-sidebar-ring rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-sidebar-ring min-w-0"
                                    />
                                    <button
                                      onClick={() => commitRename(chat.id)}
                                      className="p-1 rounded text-success hover:bg-success/10 transition-colors shrink-0"
                                      aria-label="Save"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={cancelRename}
                                      className="p-1 rounded text-sidebar-muted hover:bg-sidebar-border/50 transition-colors shrink-0"
                                      aria-label="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setCurrentChat(chat.id)} aria-label={`Open chat: ${chat.title}`} aria-current={isActive ? 'page' : undefined} className="block w-full min-w-0 text-left">
                                    <span className="block text-[13.5px] font-medium truncate leading-tight">{chat.title}</span>
                                    <span className="block text-xs text-sidebar-muted mt-0.5">
                                      {formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true })}
                                    </span>
                                  </button>
                                )}
                              </div>

                              {!isEditing && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => startRename(chat, e)}
                                    className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-border/60 transition-all"
                                    aria-label="Rename chat"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => startDelete(chat.id, e)}
                                    className="p-1.5 rounded-lg text-sidebar-muted hover:text-destructive hover:bg-destructive/10 transition-all"
                                    aria-label="Delete chat"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom profile chip */}
      {collapsed && <button onClick={logout} className="icon-button mx-auto mb-2" aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>}
      <div className={cn('flex items-center gap-2.5 border-t border-sidebar-border py-3.5', collapsed ? 'justify-center px-3' : 'px-4')}>
        <div className="w-[30px] h-[30px] rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
          {getInitials(user.name)}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold truncate leading-tight">{user.name}</p>
              <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-sidebar-muted hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
