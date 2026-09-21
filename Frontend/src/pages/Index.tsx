import { useEffect, useState } from 'react'; // useState kept for isInitialized guard
import { WorkspaceLoading } from '@/components/Brand';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LoginPage } from '@/components/auth/LoginPage';
import { ModelSelector } from '@/components/auth/ModelSelector';
import { ChatLayout } from '@/components/chat/ChatLayout';

const Index = () => {
  const { isAuthenticated, selectedModel, initializeAuth } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeAuth();
    setIsInitialized(true);
  }, [initializeAuth]);

  if (!isInitialized) {
    return (
      <WorkspaceLoading />
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  if (!selectedModel) return <ModelSelector />;

  return <ChatLayout />;
};

export default Index;
