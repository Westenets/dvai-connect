'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function SettingsMenu() {
    const { logout } = useAuth();
    const router = useRouter();

    const TABS = [
        { id: 'General', icon: 'settings', label: 'General' },
        { id: 'Audio', icon: 'mic', label: 'Audio' },
        { id: 'Video', icon: 'videocam', label: 'Video' },
        { id: 'Account', icon: 'account_circle', label: 'Account' },
        { id: 'Notifications', icon: 'notifications', label: 'Notifications' },
    ];

    const handleTabClick = (tabId: string) => {
        router.push(`/settings?tab=${tabId}`);
    };

    return (
        <div className="min-h-screen bg-white dark:bg-[#1a2632] flex flex-col antialiased">
            {/* Header */}
            <header className="flex items-center gap-4 px-4 h-16 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors bg-transparent border-0 text-slate-700 dark:text-slate-200"
                >
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                </button>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Settings</h1>
            </header>

            {/* Menu Content */}
            <main className="grow overflow-y-auto p-4 flex flex-col gap-2">
                <nav className="flex flex-col gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className="flex items-center w-full text-left gap-4 px-4 py-4 rounded-xl bg-transparent border-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[24px] text-[#00a8a8]">
                                {tab.icon}
                            </span>
                            <div className="grow">
                                <span className="text-base font-medium block">{tab.label}</span>
                            </div>
                            <span className="material-symbols-outlined text-slate-400 text-[20px]">
                                chevron_right
                            </span>
                        </button>
                    ))}
                </nav>

                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-4 px-4 py-4 bg-transparent border-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                    >
                        <span className="material-symbols-outlined text-[24px]">logout</span>
                        <span className="text-base font-medium">Log Out</span>
                    </button>
                </div>
            </main>

            {/* Logo Footer */}
            <footer className="p-8 flex justify-center opacity-30">
                <img
                    src="/images/livekit-meet-home.svg"
                    alt="DVAI Connect"
                    className="h-6 object-contain hidden dark:block"
                />
                <img
                    src="/images/livekit-meet-home-light.svg"
                    alt="DVAI Connect"
                    className="h-6 object-contain block dark:hidden"
                />
            </footer>
        </div>
    );
}
