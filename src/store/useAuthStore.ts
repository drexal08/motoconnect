import { create } from 'zustand';

export type UserRole = 'passenger' | 'rider';
export type PlanTier = 'agahozo' | 'isonga' | 'impuruza';

interface AuthState {
  user: {
    role: UserRole;
    name: string;
    phone: string;
    nationalId?: string;
    driversLicense?: string;
    plate?: string;
    plan: PlanTier;
    requestCount: number;
  } | null;
  isAuthenticated: boolean;
  errorMessage: string;
  setUser: (u: AuthState['user'], role: UserRole) => void;
  setPlan: (tier: PlanTier) => void;
  addRequest: () => void;
  clearError: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  errorMessage: '',
  setUser: (u, role) =>
    set({
      user: u ? { ...u, role } : null,
      isAuthenticated: !!u,
      errorMessage: '',
    }),
  setPlan: (tier) =>
    set((s) => ({
      user: s.user ? { ...s.user, plan: tier } : null,
    })),
  addRequest: () =>
    set((s) => ({
      user: s.user ? { ...s.user, requestCount: s.user.requestCount + 1 } : null,
    })),
  clearError: () => set({ errorMessage: '' }),
  logout: () => set({ user: null, isAuthenticated: false, errorMessage: '' }),
}));
