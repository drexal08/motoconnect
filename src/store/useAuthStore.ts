import { create } from 'zustand';
import { api, getToken, setToken, clearToken } from '../api/client';
import type { MeResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  riderVerification: 'pending_verification' | 'verified' | 'rejected' | null;
  ready: boolean; // auth restored from storage
  signIn: (token: string, user: User) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  riderVerification: null,
  ready: false,

  signIn: (token, user) => {
    setToken(token);
    set({ user, ready: true });
  },

  refreshMe: async () => {
    if (!getToken()) {
      set({ user: null, ready: true });
      return;
    }
    try {
      const me = await api<MeResponse>('/api/auth/me');
      set({
        user: me.user,
        riderVerification: me.riderProfile?.verificationStatus ?? null,
        ready: true,
      });
    } catch {
      clearToken();
      set({ user: null, riderVerification: null, ready: true });
    }
  },

  logout: () => {
    clearToken();
    set({ user: null, riderVerification: null, ready: true });
  },
}));

// Restore the session once on app boot.
useAuthStore.getState().refreshMe();
