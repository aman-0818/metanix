import { useAuthStore } from '@/hooks/useAuthStore';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, User, Lock, LogIn, Globe } from 'lucide-react';
import BorderGlow from '@/components/effects/BorderGlow';
import './LoginPage.css';

// Code-split: three.js (~500KB) should only download when the login page
// actually renders, not get bundled into every other page's chunk.
const MagicRings = lazy(() => import('@/components/effects/MagicRings'));

const AZURE_AD_ENABLED = import.meta.env.VITE_AZURE_AD_ENABLED === 'true';

// Shared hover/proximity glow for every button + input box on this page —
// teal to match the app's palette, small glow radius since these are
// compact, closely-stacked controls rather than big showcase cards.
const GLOW_PROPS = {
  edgeSensitivity: 30,
  glowColor: '173 80 50',
  backgroundColor: '#FFFFFF',
  borderRadius: 10,
  glowRadius: 14,
  glowIntensity: 0.9,
  coneSpread: 25,
  animated: false,
  colors: ['#12A594', '#3DE0C4', '#0E8677'],
};

export function LoginPage() {
  const navigate = useNavigate();
  const { startAzureLogin, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isSsoLoading,   setIsSsoLoading]   = useState(false);
  const mountedRef = useRef(true);
  const busy = isLoginLoading || isSsoLoading;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleAzureLogin = async () => {
    setError(''); setIsSsoLoading(true);
    try { await startAzureLogin(); }
    catch { if (mountedRef.current) { setError('Azure AD login failed. Please try again.'); setIsSsoLoading(false); } }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!username.trim()) { setError('Username is required'); return; }
    if (!password.trim()) { setError('Password is required'); return; }
    setIsLoginLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        // Login succeeded - redirect to dashboard
        if (mountedRef.current) {
          navigate('/');
        }
      } else if (!result.success && mountedRef.current) {
        if (result.error?.toLowerCase().includes('azure ad') || result.error?.toLowerCase().includes('sso')) {
          setError(''); setIsSsoLoading(true); setIsLoginLoading(false);
          try { await startAzureLogin(); return; }
          catch { if (mountedRef.current) { setError('Azure AD login failed. Please try the SSO button.'); setIsSsoLoading(false); } return; }
        }
        setError(result.error || 'Invalid username or password');
        setIsLoginLoading(false);
      }
    } catch { if (mountedRef.current) { setError('Login failed. Please try again.'); setIsLoginLoading(false); } }
  };

  return (
    <div className="lp-root">
      {/* Ambient background effect, behind the card */}
      <Suspense fallback={null}>
        <MagicRings
          className="lp-rings-bg"
          color="#12A594"
          colorTwo="#3DE0C4"
          ringCount={6}
          speed={1}
          attenuation={10}
          lineThickness={2}
          baseRadius={0.35}
          radiusStep={0.1}
          scaleRate={0.1}
          opacity={1}
          noiseAmount={0.1}
          rotation={0}
          ringGap={1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse={false}
          mouseInfluence={0.2}
          hoverScale={1.2}
          parallax={0.05}
          clickBurst={false}
        />
      </Suspense>

      {/* ─────────────── Login Panel (single column) ─────────────── */}
      <div className="lp-form-side">
        <div className="lp-card">

          {/* Logo */}
          <div className="lp-mobile-logo">
            <img src="/company-logo.png" alt="AionOS" className="lp-logo-full-md" />
            <span className="font-serif italic font-bold text-[30px] wordmark-shimmer">GINI</span>
          </div>

          <form onSubmit={handleLocalLogin} className="lp-form">
            {error && (
              <div className="lp-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* SSO is the primary path for an Azure AD-enabled deployment — it gets the
                solid/primary button treatment and top billing; local credentials are the
                secondary/fallback path. When Azure AD isn't enabled for this deployment,
                the credentials form is the only path and keeps the primary treatment. */}
            {AZURE_AD_ENABLED && (
              <>
                <BorderGlow {...GLOW_PROPS}>
                  <button
                    type="button"
                    className="lp-btn-primary"
                    disabled={busy}
                    onClick={handleAzureLogin}
                  >
                    {isSsoLoading
                      ? <><span className="lp-spinner" /> Redirecting…</>
                      : <><Globe size={15} /> Sign in with AIONOS</>}
                  </button>
                </BorderGlow>

                <div className="lp-divider"><span>or sign in with your credentials</span></div>
              </>
            )}

            <div className="lp-field">
              <label htmlFor="lp-username" className="lp-label sr-only">Username</label>
              <BorderGlow {...GLOW_PROPS}>
                <div className="lp-input-wrap">
                  <User size={15} className="lp-field-icon" />
                  <input
                    id="lp-username"
                    type="text"
                    className="lp-input"
                    placeholder="Enter your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>
              </BorderGlow>
            </div>

            <div className="lp-field">
              <label htmlFor="lp-password" className="lp-label sr-only">Password</label>
              <BorderGlow {...GLOW_PROPS}>
                <div className="lp-input-wrap">
                  <Lock size={15} className="lp-field-icon" />
                  <input
                    id="lp-password"
                    type="password"
                    className="lp-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </BorderGlow>
            </div>

            <BorderGlow {...GLOW_PROPS}>
              <button
                type="submit"
                className={AZURE_AD_ENABLED ? 'lp-btn-outline' : 'lp-btn-primary'}
                disabled={busy}
              >
                {isLoginLoading
                  ? <><span className={AZURE_AD_ENABLED ? 'lp-spinner lp-spinner-dark' : 'lp-spinner'} /> Signing in…</>
                  : <><LogIn size={15} /> Sign in</>}
              </button>
            </BorderGlow>
          </form>
        </div>
      </div>
    </div>
  );
}
