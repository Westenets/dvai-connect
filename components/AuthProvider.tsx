'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { account } from '@/lib/appwrite';
import { Models } from 'appwrite';

interface AuthContextType {
    user: Models.User<Models.Preferences> | null;
    isLoading: boolean;
    checkSession: () => Promise<void>;
    logout: () => Promise<void>;
    updatePrefs: (newPrefs: Record<string, any>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    checkSession: async () => {},
    logout: async () => {},
    updatePrefs: async () => {},
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

    const updatePrefs = async (newPrefs: Record<string, any>) => {
        if (!user) return;

        const filteredPrefs = { ...newPrefs };
        Object.keys(filteredPrefs).forEach(
            (key) => filteredPrefs[key] === undefined && delete filteredPrefs[key],
        );

        const mergedPrefs = { ...user.prefs, ...filteredPrefs };

        // Optimistically update the UI
        const updatedUser = {
            ...user,
            prefs: mergedPrefs,
        };
        setUser(updatedUser);

        try {
            // Save to Appwrite
            await account.updatePrefs(mergedPrefs);
        } catch (error) {
            console.error('Failed to update preferences:', error);
            setUser(user); // Revert on error
            throw error;
        }
    };

    useEffect(() => {
        checkSession();
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, checkSession, logout, updatePrefs }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
