'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

interface HeaderProps {
    isMobile: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isMobile }) => {
    const router = useRouter();
    const { user, logout } = useAuth();
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setCurrentDate(
                now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
            );
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, []);

    if (!user) return null;

    const prefs = user.prefs as Record<string, any>;
    const initialLetter = user.name ? user.name.charAt(0).toUpperCase() : '?';
    const avatarUrl = prefs?.avatarUrl;
    const avatarThumbUrl = prefs?.avatarThumbUrl;

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-0 bg-white dark:bg-[#15202b] px-6 py-3 sticky top-0 z-50">
            <div className="flex items-center gap-3">
                <img
                    src="/images/livekit-meet-home.svg"
                    alt="DVAI Connect"
                    className="h-8 md:h-10 object-contain hidden dark:block cursor-pointer"
                    onClick={() => router.push('/')}
                />
                <img
                    src="/images/livekit-meet-home-light.svg"
                    alt="DVAI Connect"
                    className="h-8 md:h-10 object-contain block dark:hidden cursor-pointer"
                    onClick={() => router.push('/')}
                />
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
                <div className="hidden md:flex flex-col items-end mr-2">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {currentTime}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-500">
                        {currentDate}
                    </span>
                </div>
                {!isMobile && (
                    <button
                        className="group flex items-center justify-center rounded-full size-10 bg-transparent border-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 cursor-pointer"
                        onClick={() => {
                            window.open('https://deepvoiceai.co/pages/contact/', '_blank');
                        }}
                    >
                        <span className="material-symbols-outlined text-[24px]">help</span>
                    </button>
                )}
                {!isMobile && (
                    <button
                        className="group flex items-center justify-center rounded-full size-10 bg-transparent border-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 relative cursor-pointer"
                        onClick={() => {
                            router.push(isMobile ? '/settings/menu' : '/settings');
                        }}
                    >
                        <span className="material-symbols-outlined text-[24px]">settings</span>
                    </button>
                )}

                <div className="relative">
                    <div
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="bg-center flex items-center justify-center font-bold text-slate-600 dark:text-white bg-slate-200 dark:bg-slate-700 bg-no-repeat bg-cover rounded-full size-10 border-2 border-slate-100 dark:border-slate-700 cursor-pointer"
                        style={
                            avatarThumbUrl || avatarUrl
                                ? { backgroundImage: `url("${avatarThumbUrl || avatarUrl}")` }
                                : {}
                        }
                    >
                        {!(avatarThumbUrl || avatarUrl) && initialLetter}
                    </div>

                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 z-50 border border-slate-200 dark:border-slate-700">
                            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                                <p className="text-sm font-medium dark:text-white truncate">
                                    {user.name}
                                </p>
                                <p className="text-xs text-slate-500 truncate">{user.email}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    router.push('/recordings');
                                }}
                                className="block w-full text-left px-4 py-2 text-sm bg-transparent border-0 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                                Recordings
                            </button>
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    router.push(isMobile ? '/settings/menu' : '/settings');
                                }}
                                className="block w-full text-left px-4 py-2 text-sm bg-transparent border-0 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                                Settings
                            </button>
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    logout();
                                }}
                                className="block w-full text-left px-4 py-2 text-sm bg-transparent border-0 text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
