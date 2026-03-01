'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { account } from '@/lib/appwrite';
import { Models } from 'appwrite';

interface AuthContextType {
  user: Models.User<Models.Preferences> | null;
  isLoading: boolean;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  checkSession: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = async () => {
    try {
      setIsLoading(true);
      const session = await account.get();
      setUser(session);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    setUser(null);
  };

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, checkSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
