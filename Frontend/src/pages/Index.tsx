import { useEffect, useState } from 'react'; // useState kept for isInitialized guard
import { Loader2 } from 'lucide-react';
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
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  if (!selectedModel) return <ModelSelector />;

  return <ChatLayout />;
};

export default Index;
