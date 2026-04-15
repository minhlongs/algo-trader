/**
 * Auth store — CashClaw authentication via Better Auth.
 * Uses Better Auth client for sign-in/sign-up/session.
 * Zustand for local state (tier, role, apiKey not managed by Better Auth).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authClient } from '../lib/auth-client';

interface AuthState {
  loggedIn: boolean;
  email: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  role: 'admin' | 'user';
  token: string | null;
  tenantId: string | null;
  apiKey: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, tier: 'free' | 'pro' | 'enterprise') => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      loggedIn: false,
      email: '',
      name: '',
      tier: 'free',
      role: 'user',
      token: null,
      tenantId: null,
      apiKey: null,
      loading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const { data, error } = await authClient.signIn.email({
            email,
            password,
          });
          if (error) {
            set({ loading: false, error: error.message || 'Sign in failed' });
            return;
          }
          if (data) {
            set({
              loggedIn: true,
              email: data.user?.email || email,
              name: data.user?.name || '',
              token: data.token || null,
              loading: false,
            });
          }
        } catch {
          set({ loading: false, error: 'Cannot connect to server. Please try again.' });
        }
      },

      signup: async (email: string, password: string, tier: 'free' | 'pro' | 'enterprise') => {
        set({ loading: true, error: null });
        try {
          const { data, error } = await authClient.signUp.email({
            email,
            password,
            name: email.split('@')[0] || 'User',
          });
          if (error) {
            set({ loading: false, error: error.message || 'Sign up failed' });
            return;
          }
          if (data) {
            set({
              loggedIn: true,
              email: data.user?.email || email,
              name: data.user?.name || '',
              token: data.token || null,
              tier,
              loading: false,
            });
          }
        } catch {
          set({ loading: false, error: 'Cannot connect to server. Please try again.' });
        }
      },

      fetchMe: async () => {
        try {
          const { data } = await authClient.getSession();
          if (data?.user) {
            set({
              loggedIn: true,
              email: data.user.email,
              name: data.user.name || '',
            });
          }
        } catch {
          // silently ignore
        }
      },

      logout: () => {
        authClient.signOut().catch(() => {});
        set({
          loggedIn: false,
          email: '',
          name: '',
          tier: 'free',
          role: 'user',
          token: null,
          tenantId: null,
          apiKey: null,
          error: null,
        });
      },
    }),
    {
      name: 'cashclaw-auth',
      partialize: (state) => ({
        loggedIn: state.loggedIn,
        email: state.email,
        name: state.name,
        tier: state.tier,
        role: state.role,
        tenantId: state.tenantId,
        // Exclude token + apiKey from localStorage — cookies handle session
      }),
    }
  )
);
