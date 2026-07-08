import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'passenger' | 'rider';
  avatar?: string;
  phone?: string;
  subscription?: {
    tier: 'free' | 'basic' | 'pro' | 'max';
    expiresAt: string;
    viewsRemaining: number;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string, role: 'passenger' | 'rider', phone: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (role?: 'passenger' | 'rider') => Promise<{ success: boolean; error?: string }>;
  loginWithFacebook: (role?: 'passenger' | 'rider') => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'motoconnect_user';
const RWANDA_PHONE_REGEX = /^\+250\s?\d{3}\s?\d{3}\s?\d{3}$/;

const isValidRole = (value: unknown): value is User['role'] =>
  value === 'passenger' || value === 'rider';

const sanitizeName = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const sanitizeEmail = (value: string) =>
  value.trim().toLowerCase();

const sanitizePhone = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const isValidPhone = (value: string) =>
  RWANDA_PHONE_REGEX.test(sanitizePhone(value));

const buildSubscription = (role: User['role']): User['subscription'] | undefined =>
  role === 'rider'
    ? {
        tier: 'free',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        viewsRemaining: 3,
      }
    : undefined;

const sanitizeStoredUser = (value: unknown): User | null => {
  if (!value || typeof value !== 'object') return null;

  const rawUser = value as Partial<User>;
  if (
    typeof rawUser.id !== 'string' ||
    typeof rawUser.name !== 'string' ||
    typeof rawUser.email !== 'string' ||
    !isValidRole(rawUser.role)
  ) {
    return null;
  }

  const sanitizedUser: User = {
    id: rawUser.id,
    name: sanitizeName(rawUser.name),
    email: sanitizeEmail(rawUser.email),
    role: rawUser.role,
  };

  if (typeof rawUser.avatar === 'string' && rawUser.avatar.trim()) {
    sanitizedUser.avatar = rawUser.avatar;
  }

  if (typeof rawUser.phone === 'string' && isValidPhone(rawUser.phone)) {
    sanitizedUser.phone = sanitizePhone(rawUser.phone);
  }

  if (rawUser.subscription) {
    const subscription = rawUser.subscription;
    if (
      typeof subscription === 'object' &&
      subscription !== null &&
      ['free', 'basic', 'pro', 'max'].includes(subscription.tier ?? '') &&
      typeof subscription.expiresAt === 'string' &&
      typeof subscription.viewsRemaining === 'number'
    ) {
      sanitizedUser.subscription = {
        tier: subscription.tier as NonNullable<User['subscription']>['tier'],
        expiresAt: subscription.expiresAt,
        viewsRemaining: subscription.viewsRemaining,
      };
    }
  }

  return sanitizedUser;
};

const getStoredUser = (): User | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? sanitizeStoredUser(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = sanitizeEmail(email);
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));

    if (normalizedEmail && password.length >= 6) {
      const isRider = normalizedEmail.includes('rider');
      const newUser: User = {
        id: 'demo-' + Date.now(),
        name: normalizedEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        email: normalizedEmail,
        role: isRider ? 'rider' : 'passenger',
        phone: '+250 788 000 001',
        subscription: buildSubscription(isRider ? 'rider' : 'passenger'),
      };
      setUser(newUser);
      setIsLoading(false);
      return { success: true };
    }
    setIsLoading(false);
    return { success: false, error: 'Invalid email or password' };
  }, []);

  const signup = useCallback(async (
    name: string, email: string, password: string, role: 'passenger' | 'rider', phone: string
  ): Promise<{ success: boolean; error?: string }> => {
    const normalizedName = sanitizeName(name);
    const normalizedEmail = sanitizeEmail(email);
    const normalizedPhone = sanitizePhone(phone);

    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));

    if (!normalizedName || !normalizedEmail || password.length < 6) {
      setIsLoading(false);
      return { success: false, error: 'Please fill all required fields' };
    }

    if (!isValidPhone(normalizedPhone)) {
      setIsLoading(false);
      return { success: false, error: 'Enter a valid Rwanda phone number like +250 788 000 001' };
    }

    if (normalizedName && normalizedEmail && password.length >= 6) {
      const newUser: User = {
        id: 'demo-' + Date.now(),
        name: normalizedName,
        email: normalizedEmail,
        role,
        phone: normalizedPhone,
        subscription: buildSubscription(role),
      };
      setUser(newUser);
      setIsLoading(false);
      return { success: true };
    }
    setIsLoading(false);
    return { success: false, error: 'Please fill all required fields' };
  }, []);

  const loginWithGoogle = useCallback(async (role: User['role'] = 'passenger'): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const newUser: User = {
      id: 'google-' + Date.now(),
      name: 'Google User',
      email: 'user@gmail.com',
      role,
      avatar: 'https://lh3.googleusercontent.com/a/default-user',
      phone: '+250 788 000 001',
      subscription: buildSubscription(role),
    };
    setUser(newUser);
    setIsLoading(false);
    return { success: true };
  }, []);

  const loginWithFacebook = useCallback(async (role: User['role'] = 'passenger'): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const newUser: User = {
      id: 'fb-' + Date.now(),
      name: 'Facebook User',
      email: 'user@facebook.com',
      role,
      phone: '+250 788 000 001',
      subscription: buildSubscription(role),
    };
    setUser(newUser);
    setIsLoading(false);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;

      const nextUser: User = {
        ...prev,
        ...updates,
      };

      return sanitizeStoredUser(nextUser) ?? prev;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      signup,
      loginWithGoogle,
      loginWithFacebook,
      logout,
      updateUser,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
