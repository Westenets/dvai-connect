'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { account } from '@/lib/appwrite';
import { Models } from 'appwrite';
import Clarity from '@microsoft/clarity';

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

// Appwrite JWTs expire after 15 min. Re-mint at 13 min to stay ahead.
const JWT_REFRESH_INTERVAL_MS = 13 * 60 * 1000;

/**
 * Push a fresh Appwrite JWT into our HttpOnly session cookie via
 * /api/auth/sync. This is the bridge that lets server components and
 * /api/* routes see the user — see lib/auth/session.ts.
 */
async function syncServerSession(): Promise<void> {
    try {
        const { jwt } = await account.createJWT();
        const res = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jwt }),
        });
        if (!res.ok) {
            console.warn('[auth] /api/auth/sync responded', res.status);
        }
    } catch (err: any) {
        // Most commonly: no active Appwrite session yet (createJWT fails
        // with 401). Safe to swallow — the bridge cookie just stays
        // empty and server-side helpers return null.
        console.debug('[auth] syncServerSession skipped:', err?.message ?? err);
    }
}

async function clearServerSession(): Promise<void> {
    try {
        await fetch('/api/auth/sync', { method: 'DELETE' });
    } catch {
        // best-effort — cookie has maxAge=15min so it'll expire anyway
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const checkSession = async () => {
        try {
            setIsLoading(true);
            const session = await account.get();
            setUser(session);
            // Bridge the Appwrite session into our HttpOnly cookie so
            // server components / API routes can authenticate.
            await syncServerSession();

            // Analytics should be non-blocking and safe
            try {
                if (session?.$id) {
                    Clarity.identify(session.$id);
                }
            } catch (analyticsError) {
                // Suppress analytics error to prevent redirect loop
                console.warn('Clarity identification failed:', analyticsError);
            }
        } catch (error) {
            setUser(null);
            // Make sure any stale bridge cookie doesn't outlive the
            // browser session.
            await clearServerSession();
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
        await clearServerSession();
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

    // Re-mint the JWT bridge cookie before it expires while a user is
    // logged in. The interval is cleared on logout / unmount.
    useEffect(() => {
        if (!user) {
            if (refreshTimer.current) {
                clearInterval(refreshTimer.current);
                refreshTimer.current = null;
            }
            return;
        }
        refreshTimer.current = setInterval(() => {
            syncServerSession();
        }, JWT_REFRESH_INTERVAL_MS);
        return () => {
            if (refreshTimer.current) {
                clearInterval(refreshTimer.current);
                refreshTimer.current = null;
            }
        };
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, isLoading, checkSession, logout, updatePrefs }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
