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
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  loginWithFacebook: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'motoconnect_user';

const getStoredUser = (): User | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
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
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    
    if (email && password.length >= 6) {
      const isRider = email.includes('rider');
      const newUser: User = {
        id: 'demo-' + Date.now(),
        name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        email,
        role: isRider ? 'rider' : 'passenger',
        phone: '+250 788 000 001',
        subscription: isRider ? {
          tier: 'free',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          viewsRemaining: 3,
        } : undefined,
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
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    
    if (name && email && password.length >= 6) {
      const newUser: User = {
        id: 'demo-' + Date.now(),
        name,
        email,
        role,
        phone,
        subscription: role === 'rider' ? {
          tier: 'free',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          viewsRemaining: 3,
        } : undefined,
      };
      setUser(newUser);
      setIsLoading(false);
      return { success: true };
    }
    setIsLoading(false);
    return { success: false, error: 'Please fill all required fields' };
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const newUser: User = {
      id: 'google-' + Date.now(),
      name: 'Google User',
      email: 'user@gmail.com',
      role: 'passenger',
      avatar: 'https://lh3.googleusercontent.com/a/default-user',
    };
    setUser(newUser);
    setIsLoading(false);
    return { success: true };
  }, []);

  const loginWithFacebook = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    const newUser: User = {
      id: 'fb-' + Date.now(),
      name: 'Facebook User',
      email: 'user@facebook.com',
      role: 'passenger',
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
    setUser(prev => prev ? { ...prev, ...updates } : null);
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
