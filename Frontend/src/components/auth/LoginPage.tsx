import { useAuthStore } from '@/hooks/useAuthStore';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  FileText,
  Presentation,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import './LoginPage.css';

const AZURE_AD_ENABLED = import.meta.env.VITE_AZURE_AD_ENABLED === 'true';

export function LoginPage() {
  const navigate = useNavigate();
  const { startAzureLogin, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isSsoLoading, setIsSsoLoading] = useState(false);
  const mountedRef = useRef(true);
  const busy = isLoginLoading || isSsoLoading;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleAzureLogin = async () => {
    setError('');
    setIsSsoLoading(true);
    try {
      await startAzureLogin();
    } catch {
      if (mountedRef.current) {
        setError('Azure AD login failed. Please try again.');
        setIsSsoLoading(false);
      }
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    setIsLoginLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        // Login succeeded - redirect to dashboard
        if (mountedRef.current) {
          navigate('/');
        }
      } else if (!result.success && mountedRef.current) {
        if (
          AZURE_AD_ENABLED &&
          (result.error?.toLowerCase().includes('azure ad') ||
            result.error?.toLowerCase().includes('sso'))
        ) {
          setError('');
          setIsSsoLoading(true);
          setIsLoginLoading(false);
          try {
            await startAzureLogin();
            return;
          } catch {
            if (mountedRef.current) {
              setError('Azure AD login failed. Please try the SSO button.');
              setIsSsoLoading(false);
            }
            return;
          }
        }
        setError(result.error || 'Invalid username or password');
        setIsLoginLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setError('Login failed. Please try again.');
        setIsLoginLoading(false);
      }
    }
  };

  return (
    <main className="lp-root">
      <section className="lp-story" aria-label="About Metanix">
        <Brand />
        <div className="lp-story-content">
          <span className="eyebrow">A little clarity. A lot of possibility.</span>
          <h1>
            Your next big idea
            <br />
            starts here<span className="text-primary">.</span>
          </h1>
          <p>A space to think deeper, create freely, and turn the complex into something clear.</p>
          <div className="lp-capabilities">
            <div>
              <MessageSquare />
              <span>
                Find a new perspective<small>Explore ideas with your choice of AI.</small>
              </span>
            </div>
            <div>
              <FileText />
              <span>
                Make sense of every detail<small>Bring your documents into the conversation.</small>
              </span>
            </div>
            <div>
              <Presentation />
              <span>
                Give your ideas a stage<small>Go from a thought to a presentation.</small>
              </span>
            </div>
          </div>
        </div>
        <div className="lp-story-footer">
          <span>THINK. CREATE. TRANSFORM.</span>
          <span>01 — ∞</span>
        </div>
      </section>
      <section className="lp-form-side" aria-label="Sign in">
        <div className="lp-topbar">
          <Brand className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="lp-card animate-slide-up">
          <div className="lp-form-heading">
            <span className="eyebrow">YOUR AI WORKSPACE</span>
            <h2>Welcome back.</h2>
            <p>Sign in to make room for what’s next.</p>
          </div>
          <form onSubmit={handleLocalLogin} className="lp-form" aria-busy={busy}>
            {error && (
              <div id="login-error" className="lp-error" role="alert">
                <AlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}
            {AZURE_AD_ENABLED && (
              <>
                <button
                  type="button"
                  className="lp-btn-outline"
                  disabled={busy}
                  onClick={handleAzureLogin}
                >
                  {isSsoLoading ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Globe size={17} />
                  )}
                  {isSsoLoading ? 'Redirecting…' : 'Continue with Microsoft'}
                </button>
                <div className="lp-divider">
                  <span>or use your credentials</span>
                </div>
              </>
            )}
            <div className="lp-field">
              <label htmlFor="lp-username">Username</label>
              <input
                id="lp-username"
                className="lp-input"
                placeholder="Your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            <div className="lp-field">
              <label htmlFor="lp-password">Password</label>
              <div className="lp-password-wrap">
                <input
                  id="lp-password"
                  type={showPassword ? 'text' : 'password'}
                  className="lp-input"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button type="submit" className="lp-btn-primary" disabled={busy}>
              {isLoginLoading ? (
                <>
                  <Loader2 size={17} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Enter workspace <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <p className="lp-help">Need access? Contact your workspace administrator.</p>
        </div>
        <p className="lp-footer">
          METANIX <span>Intelligence, with intention.</span>
        </p>
      </section>
    </main>
  );
}
