import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '@/lib/api';
import type { SessionInfo } from '@/types/chat';

interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'admin' | 'user';
  is_superuser?: boolean;
  has_document_converter?: boolean;
  cost_quota_usd?: string | null;
  cost_used_usd?: string;
}

const parseApiError = (error: any) => {
  const raw = error?.message;
  if (!raw || typeof raw !== 'string') return 'Request failed';
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    const payload = parts.slice(1).join(' - ');
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.error) return parsed.error;
    } catch { /* use raw */ }
  }
  return raw;
};

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  username: string | null;
  role: 'admin' | 'user' | null;
  /** Provider ID (number) or name (string kept for compat). */
  selectedModel: string | null;
  selectedModelId: number | null;
  session: SessionInfo | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  startAzureLogin: () => Promise<void>;
  exchangeAzureCode: (code: string, state?: string | null) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setSelectedModel: (model: string, modelId?: number) => void;
  setRole: (role: 'admin' | 'user') => void;
  initializeAuth: () => void;
  getRole: () => 'admin' | 'user' | null;
  refreshSession: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      username: null,
      role: null,
      selectedModel: null,
      selectedModelId: null,
      session: null,

      login: async (username: string, password: string) => {
        try {
          const response = await apiService.login(username, password);
          const user: User = {
            id: response.user.id,
            username: response.user.username,
            email: response.user.email,
            first_name: response.user.first_name,
            last_name: response.user.last_name,
            role: response.user.role,
            is_superuser: response.user.is_superuser,
            has_document_converter: response.user.has_document_converter,
            cost_quota_usd: response.user.cost_quota_usd,
            cost_used_usd: response.user.cost_used_usd,
          };
          set({
            isAuthenticated: true,
            user,
            token: response.access,
            refreshToken: response.refresh,
            username: user.username,
            role: user.role,
            session: response.session,
          });
          return { success: true };
        } catch (error: any) {
          console.error('Login failed:', error);
          return { success: false, error: parseApiError(error) };
        }
      },

      startAzureLogin: async () => {
        // State — random hex, CSRF binding checked on callback (exchangeAzureCode)
        const stateBytes = new Uint8Array(16);
        crypto.getRandomValues(stateBytes);
        const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('');

        // Nonce — random hex, bound into the returned ID token and re-checked
        // server-side (verify_id_token) so a leaked/replayed ID token from a
        // different login attempt can't be reused here.
        const nonceBytes = new Uint8Array(16);
        crypto.getRandomValues(nonceBytes);
        const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, '0')).join('');

        // PKCE — RFC 7636: code_verifier must be base64url(random 32 bytes)
        const codeVerifierBytes = new Uint8Array(32);
        crypto.getRandomValues(codeVerifierBytes);
        const codeVerifier = btoa(String.fromCharCode(...codeVerifierBytes))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        // code_challenge = base64url(SHA-256(ASCII(code_verifier)))
        const encoder = new TextEncoder();
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
        const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        localStorage.setItem('azure_auth_state', state);
        localStorage.setItem(`azure_pkce_${state}`, codeVerifier);
        localStorage.setItem(`azure_nonce_${state}`, nonce);
        const response = await apiService.getAzureAuthorizeUrl(state, codeChallenge, nonce);
        window.location.href = response.authorize_url;
      },

      exchangeAzureCode: async (code: string, state?: string | null) => {
        try {
          // CSRF binding: this callback is only valid if it matches a login
          // this same browser actually started. A missing stored state (no
          // pending login here) or a mismatch is rejected outright — it is
          // never treated as "trust whatever the URL says".
          const storedState = localStorage.getItem('azure_auth_state');
          if (!state || !storedState || state !== storedState) {
            throw new Error('Invalid or expired login attempt. Please sign in again.');
          }
          const codeVerifier = localStorage.getItem(`azure_pkce_${state}`) || undefined;
          const nonce = localStorage.getItem(`azure_nonce_${state}`) || undefined;
          if (!codeVerifier) {
            throw new Error('Invalid or expired login attempt. Please sign in again.');
          }
          const response = await apiService.exchangeAzureCode(code, codeVerifier, nonce);

          const user: User = {
            id: response.user.id,
            username: response.user.username,
            email: response.user.email,
            first_name: response.user.first_name,
            last_name: response.user.last_name,
            role: response.user.role,
            is_superuser: response.user.is_superuser,
            has_document_converter: response.user.has_document_converter,
            cost_quota_usd: response.user.cost_quota_usd,
            cost_used_usd: response.user.cost_used_usd,
          };

          set({
            isAuthenticated: true,
            user,
            token: response.access,
            refreshToken: response.refresh,
            username: user.username,
            role: user.role,
            session: response.session,
          });
          apiService.setToken(response.access);
          if (response.refresh) apiService.setRefreshToken(response.refresh);
          localStorage.removeItem(`azure_pkce_${state}`);
          localStorage.removeItem(`azure_nonce_${state}`);
          localStorage.removeItem('azure_auth_state');
          return { success: true };
        } catch (error: any) {
          console.error('Azure login failed:', error);
          return { success: false, error: parseApiError(error) };
        }
      },

      logout: async () => {
        try {
          await apiService.stopSession();
        } catch (error) {
          console.error('Failed to stop session:', error);
        }
        apiService.setToken('');
        apiService.setRefreshToken('');
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null,
          username: null,
          role: null,
          selectedModel: null,
          selectedModelId: null,
          session: null,
        });
      },

      setSelectedModel: (model, modelId) =>
        set({ selectedModel: model, selectedModelId: modelId ?? null }),
      setRole: (role) => set({ role }),

      initializeAuth: () => {
        const { token, refreshToken } = get();
        // Register logout callback so api.ts can force-logout on expired refresh token
        apiService.setLogoutCallback(() => get().logout());
        // Keep the persisted refresh token in sync — ROTATE_REFRESH_TOKENS
        // means every silent refresh issues (and blacklists the old) token.
        apiService.setRefreshTokenUpdateCallback((token) => set({ refreshToken: token }));
        if (token) {
          apiService.setToken(token);
          if (refreshToken) apiService.setRefreshToken(refreshToken);
          set({ isAuthenticated: true });
          get().refreshSession();
          // Refresh user profile so feature flags are always current (admin may have changed them)
          get().refreshUser();
        }
      },

      getRole: () => get().user?.role || null,

      refreshSession: async () => {
        try {
          const session = await apiService.getSessionStatus();
          set({ session });
        } catch (error) {
          console.error('Failed to refresh session status:', error);
        }
      },

      refreshUser: async () => {
        try {
          const data = await apiService.getCurrentUser();
          const currentUser = get().user;
          if (currentUser) {
            set({
              user: {
                ...currentUser,
                first_name: data.first_name,
                last_name: data.last_name,
                has_document_converter: data.has_document_converter,
                cost_quota_usd: data.cost_quota_usd,
                cost_used_usd: data.cost_used_usd,
              },
            });
          }
        } catch (error) {
          console.error('Failed to refresh user profile:', error);
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        username: state.username,
        role: state.role,
        selectedModel: state.selectedModel,
        selectedModelId: state.selectedModelId,
        session: state.session,
      }),
    }
  )
);
