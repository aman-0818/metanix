import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { WorkspaceLoading } from '@/components/Brand';
import { useAuthStore } from '@/hooks/useAuthStore';
import { LoginPage } from '@/components/auth/LoginPage';
import { AdminPanel } from '@/components/auth/AdminPanel';

const Admin = () => {
  const navigate = useNavigate();
  const { isAuthenticated, initializeAuth, user } = useAuthStore();
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

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const isAdminUser = Boolean(
    user?.role === 'admin' || user?.is_superuser || user?.is_staff
  );

  if (!isAdminUser) {
    return <Navigate to="/" replace />;
  }

  return <AdminPanel variant="page" onClose={() => navigate('/')} />;
};

export default Admin;
