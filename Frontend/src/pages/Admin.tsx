import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LoginPage } from '@/components/auth/LoginPage';
import { ModelSelector } from '@/components/auth/ModelSelector';
import { AdminPanel } from '@/components/auth/AdminPanel';

const Admin = () => {
  const navigate = useNavigate();
  const { isAuthenticated, selectedModel, initializeAuth, getRole } = useAuthStore();
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

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!selectedModel) {
    return <ModelSelector />;
  }

  if (getRole() !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <AdminPanel variant="page" onClose={() => navigate('/')} />;
};

export default Admin;
