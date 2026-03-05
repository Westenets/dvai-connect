'use client';

import React, { useEffect } from 'react';
import { useAuth } from './AuthProvider';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    useEffect(() => {
        // Determine the active theme from the user preferences
        const rawAppearance = (user?.prefs as Record<string, any>)?.appearance || 'system';

        let resolvedTheme = rawAppearance;
        if (resolvedTheme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            resolvedTheme = isDark ? 'dark' : 'light';
        }

        const root = document.documentElement;
        root.setAttribute('data-theme', resolvedTheme);
        root.setAttribute('data-lk-theme', resolvedTheme);

        // Optional: toggle a pure classname for generic generic CSS selector
        if (resolvedTheme === 'light') {
            root.classList.add('light');
            root.classList.remove('dark');
        } else {
            root.classList.add('dark');
            root.classList.remove('light');
        }

        // Setup an observer for system theme changes if the preference is set to 'system'
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = (e: MediaQueryListEvent) => {
            if ((user?.prefs as Record<string, any>)?.appearance === 'system') {
                const newTheme = e.matches ? 'dark' : 'light';
                const root = document.documentElement;
                root.setAttribute('data-theme', newTheme);
                root.setAttribute('data-lk-theme', newTheme);
                if (newTheme === 'light') {
                    root.classList.add('light');
                    root.classList.remove('dark');
                } else {
                    root.classList.add('dark');
                    root.classList.remove('light');
                }
            }
        };

        if (rawAppearance === 'system') {
            mediaQuery.addEventListener('change', handleSystemThemeChange);
        }

        return () => {
            mediaQuery.removeEventListener('change', handleSystemThemeChange);
        };
    }, [user?.prefs]);

    // Provide exactly the same children without inserting any extra wrapper DIVs to keep layout pristine
    return <>{children}</>;
}
