import { Brand } from '@/components/Brand';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/hooks/useAuthStore';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const { exchangeAzureCode } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error_description') || params.get('error');

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (!code) {
      setError('Missing authorization code');
      return;
    }

    const run = async () => {
      const result = await exchangeAzureCode(code, state);
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        setError(result.error || 'Azure AD login failed');
      }
    };

    run();
  }, [exchangeAzureCode, location.search, navigate]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="surface-card p-8 text-center max-w-md w-full">
        <Brand className="mb-8" />
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">Sign-in failed</h1>
            <p className="text-sm text-destructive" role="alert">{error}</p><a href="/" className="inline-block text-sm text-primary underline mt-5">Back to sign in</a>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Completing sign-in</h1>
            <p className="text-sm text-muted-foreground">Redirecting you back to the app...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
