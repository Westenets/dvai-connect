'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { generateRoomId, randomString, encodePassphrase } from '@/lib/client-utils';
import { useAuth } from '@/components/AuthProvider';
import { databases } from '@/lib/appwrite';
import { ID } from 'appwrite';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

export default function Dashboard() {
    const router = useRouter();
    const { user, isLoading, logout } = useAuth();
    const prefs = user?.prefs as Record<string, any>;

    const [roomCode, setRoomCode] = useState('');
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [newMeetingOpen, setNewMeetingOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // E2EE configuration from settings or .env
    const e2eeEnabled = prefs?.e2e || process.env.NEXT_PUBLIC_E2EE_ENABLED === 'true';

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

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

    if (isLoading || !user) {
        return (
            <div className="min-h-screen bg-[#f5f7f8] dark:bg-[#101922] flex items-center justify-center text-slate-500">
                Loading...
            </div>
        );
    }

    const trackAdminRoom = async (roomId: string) => {
        if (!user) return;
        try {
            await databases.createDocument('dvai-connect', 'room_admins', ID.unique(), {
                roomId: roomId,
                adminId: user.$id,
            });
        } catch (error) {
            console.error('Failed to track admin room', error);
        }
    };

    const startMeeting = async () => {
        const roomId = generateRoomId();
        await trackAdminRoom(roomId);

        if (e2eeEnabled) {
            const sharedPassphrase = randomString(64);
            router.push(`/rooms/${roomId}#${encodePassphrase(sharedPassphrase)}`);
        } else {
            router.push(`/rooms/${roomId}`);
        }
    };

    const scheduleMeeting = async () => {
        const roomId = generateRoomId();
        await trackAdminRoom(roomId);

        const url = `${window.location.origin}/rooms/${roomId}`;
        window.open(
            `https://calendar.google.com/calendar/r/eventedit?text=VideoConf+Meeting&details=Join+here:+${url}`,
            '_blank',
        );
    };

    const createForLater = async () => {
        const roomId = generateRoomId();
        await trackAdminRoom(roomId);

        const url = `${window.location.origin}/rooms/${roomId}`;
        navigator.clipboard.writeText(url);
        toast.success('Meeting link copied to clipboard!', { duration: 5000 });
        setNewMeetingOpen(false);
    };

    const initialLetter = user.name ? user.name.charAt(0).toUpperCase() : '?';
    const avatarUrl = prefs?.avatarUrl;
    const avatarThumbUrl = prefs?.avatarThumbUrl;

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex flex-col font-['Inter',sans-serif] text-slate-900 dark:text-slate-100 overflow-x-hidden">
            {/* Header */}
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202b] px-6 py-3 sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <img
                        src="/images/livekit-meet-home.svg"
                        alt="DVAI Connect"
                        className="h-8 md:h-10 object-contain hidden dark:block"
                    />
                    <img
                        src="/images/livekit-meet-home-light.svg"
                        alt="DVAI Connect"
                        className="h-8 md:h-10 object-contain block dark:hidden"
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
                    {!isMobile && <button
                        className="group flex items-center justify-center rounded-full size-10 bg-transparent border-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 cursor-pointer"
                        onClick={() => {
                            window.open('https://deepvoiceai.co/pages/contact/', '_blank');
                        }}
                    >
                        <span className="material-symbols-outlined text-[24px]">help</span>
                    </button>}
                    {!isMobile && <button
                        className="group flex items-center justify-center rounded-full size-10 bg-transparent border-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400 relative cursor-pointer"
                        onClick={() => {
                            router.push(isMobile ? '/settings/menu' : '/settings');
                        }}
                    >
                        <span className="material-symbols-outlined text-[24px]">settings</span>
                    </button>}

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
                                    onClick={() =>
                                        router.push(isMobile ? '/settings/menu' : '/settings')
                                    }
                                    className="block w-full text-left px-4 py-2 text-sm bg-transparent border-0 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                    Settings
                                </button>
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        logout();
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm bg-transparent border-0 text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                    Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:flex-row w-full max-w-[1440px] mx-auto p-4 md:p-8 gap-8">
                {/* Left Column: Actions & Hero */}
                <div className="flex flex-col flex-1 justify-center max-w-2xl xl:pl-12 py-8">
                    <div className="space-y-8">
                        <div>
                            <h1 className="text-slate-900 dark:text-white text-4xl md:text-5xl font-bold leading-[1.15] mb-4">
                                Premium video meetings. <br /> Now free for everyone.
                            </h1>
                            <p className="text-slate-600 dark:text-slate-300 text-lg font-normal leading-relaxed max-w-lg">
                                We re-engineered the service we built for secure business meetings
                                to make it free and available for all with AI as a cherry on top.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                            <div className="relative">
                                <button
                                    onClick={() => setNewMeetingOpen(!newMeetingOpen)}
                                    className="flex items-center justify-center gap-2 h-12 px-6 bg-[#00a8a8] hover:bg-[#005c5c] text-white rounded-full border-0 text-base font-semibold shadow-md shadow-[#005c5c]/20 transition-all active:scale-[0.98]"
                                >
                                    <span className="material-symbols-outlined text-[24px]">
                                        video_call
                                    </span>
                                    <span>New meeting</span>
                                </button>

                                {newMeetingOpen && (
                                    <div className="absolute top-14 left-0 w-80 bg-white dark:bg-[#1e2936] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-20 py-2 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                        <button
                                            onClick={createForLater}
                                            className="w-full text-left px-4 py-3 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 border-0 flex items-center gap-4 transition-colors group"
                                        >
                                            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-[#00a8a8]">
                                                link
                                            </span>
                                            <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
                                                Create a meeting for later
                                            </span>
                                        </button>
                                        <button
                                            onClick={startMeeting}
                                            className="w-full text-left px-4 py-3 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 border-0 flex items-center gap-4 transition-colors group"
                                        >
                                            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-[#00a8a8]">
                                                add
                                            </span>
                                            <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
                                                Start an instant meeting
                                            </span>
                                        </button>
                                        <button
                                            onClick={scheduleMeeting}
                                            className="w-full text-left px-4 py-3 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 border-0 flex items-center gap-4 transition-colors group"
                                        >
                                            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-[#00a8a8]">
                                                calendar_today
                                            </span>
                                            <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
                                                Schedule in Google Calendar
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <div className="relative flex-1 sm:w-64">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                        <span className="material-symbols-outlined text-[20px]">
                                            keyboard
                                        </span>
                                    </div>
                                    <input
                                        value={roomCode}
                                        onChange={(e) => setRoomCode(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const code = roomCode.trim();
                                                const urlMatch = code.match(
                                                    /^https?:\/\/[^\/]+\/rooms\/([a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})$/,
                                                );
                                                const finalCode = urlMatch ? urlMatch[1] : code;

                                                if (
                                                    /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/.test(
                                                        finalCode,
                                                    )
                                                ) {
                                                    if (finalCode !== code) {
                                                        setRoomCode(finalCode);
                                                    }
                                                    router.push(`/rooms/${finalCode}`);
                                                }
                                            }
                                        }}
                                        className="form-input block w-full pl-10 pr-3 py-3 border border-slate-300 dark:border-slate-600 rounded-full leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00a8a8] focus:border-[#00a8a8] sm:text-base transition-all shadow-sm"
                                        placeholder="Enter meeting code or link"
                                        type="text"
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        const code = roomCode.trim();
                                        const urlMatch = code.match(
                                            /^https?:\/\/[^\/]+\/rooms\/([a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})$/,
                                        );
                                        const finalCode = urlMatch ? urlMatch[1] : code;
                                        if (/^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/.test(finalCode)) {
                                            router.push(`/rooms/${finalCode}`);
                                        }
                                    }}
                                    disabled={(() => {
                                        const code = roomCode.trim();
                                        const urlMatch = code.match(
                                            /^https?:\/\/[^\/]+\/rooms\/([a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})$/,
                                        );
                                        const finalCode = urlMatch ? urlMatch[1] : code;
                                        return !/^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/.test(finalCode);
                                    })()}
                                    className="bg-[#00a8a8] text-white hover:bg-[#00a8a8]/10 border-0 font-semibold px-4 py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Join
                                </button>
                            </div>
                        </div>
                        <div className="pt-8 border-t border-slate-200 dark:border-slate-700/50 mt-8">
                            <span className="text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1 transition-colors">
                                <span>Welcome, {user.name}!</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col flex-1 gap-6 items-center md:items-end justify-center w-full max-w-md mx-auto md:mx-0">
                    <Swiper
                        modules={[Pagination, Autoplay]}
                        pagination={{ clickable: true }}
                        autoplay={{ delay: 4000, disableOnInteraction: false }}
                        className="w-full pb-10"
                    >
                        {/* Slide 1: Security */}
                        <SwiperSlide>
                            <div className="w-full bg-white dark:bg-[#15202b] rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                                <div className="w-48 h-48 mb-6 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                                    <div className="absolute inset-0 bg-linear-to-tr from-blue-100 to-indigo-50 dark:from-slate-700 dark:to-slate-600 opacity-50"></div>
                                    <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-lg">
                                        <span className="material-symbols-outlined text-[#00a8a8] text-[96px]">
                                            security
                                        </span>
                                    </div>
                                    <div className="absolute top-8 right-8 size-4 bg-yellow-400 rounded-full animate-pulse"></div>
                                    <div className="absolute bottom-10 left-10 size-3 bg-[#00a8a8] rounded-full"></div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                    Your meeting is secure
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                                    No one can join a meeting unless invited or admitted by the
                                    host. End-to-end encryption ensures privacy, event the host
                                    cannot access your meeting.
                                </p>
                            </div>
                        </SwiperSlide>

                        {/* Slide 2: Agentic AI */}
                        <SwiperSlide>
                            <div className="w-full bg-white dark:bg-[#15202b] rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                                <div className="w-48 h-48 mb-6 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                                    <div className="absolute inset-0 bg-linear-to-tr from-emerald-100 to-teal-50 dark:from-slate-700 dark:to-slate-600 opacity-50"></div>
                                    <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-lg">
                                        <span className="material-symbols-outlined text-emerald-500 text-[96px]">
                                            smart_toy
                                        </span>
                                    </div>
                                    <div className="absolute top-10 left-8 size-4 bg-emerald-400 rounded-full animate-pulse"></div>
                                    <div className="absolute bottom-12 right-12 size-3 bg-teal-500 rounded-full"></div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                    Bring Your Own Agent
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                                    Seamlessly dispatch AI agents directly into your meeting rooms
                                    to assist with real-time intelligence.
                                </p>
                            </div>
                        </SwiperSlide>

                        {/* Slide 3: Share Link */}
                        <SwiperSlide>
                            <div className="w-full bg-white dark:bg-[#15202b] rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                                <div className="w-48 h-48 mb-6 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                                    <div className="absolute inset-0 bg-linear-to-tr from-purple-100 to-fuchsia-50 dark:from-slate-700 dark:to-slate-600 opacity-50"></div>
                                    <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-lg">
                                        <span className="material-symbols-outlined text-purple-500 text-[96px]">
                                            link
                                        </span>
                                    </div>
                                    <div className="absolute bottom-8 right-8 size-4 bg-purple-400 rounded-full animate-bounce"></div>
                                    <div className="absolute top-10 left-10 size-3 bg-fuchsia-400 rounded-full"></div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                    Get a link you can share
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                                    Click New meeting to get a link you can send to people you want
                                    to meet with securely.
                                </p>
                            </div>
                        </SwiperSlide>

                        {/* Slide 4: Plan Ahead */}
                        <SwiperSlide>
                            <div className="w-full bg-white dark:bg-[#15202b] rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
                                <div className="w-48 h-48 mb-6 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                                    <div className="absolute inset-0 bg-linear-to-tr from-amber-100 to-orange-50 dark:from-slate-700 dark:to-slate-600 opacity-50"></div>
                                    <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-lg">
                                        <span className="material-symbols-outlined text-amber-500 text-[96px]">
                                            event_available
                                        </span>
                                    </div>
                                    <div className="absolute top-12 right-10 size-4 bg-orange-400 rounded-full animate-pulse"></div>
                                    <div className="absolute bottom-10 left-8 size-3 bg-amber-500 rounded-full"></div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                    Plan ahead
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                                    Click New meeting to schedule meetings in Google Calendar and
                                    send invites to participants in advance.
                                </p>
                            </div>
                        </SwiperSlide>
                    </Swiper>
                </div>
            </main>

            <footer className="text-center py-2 text-slate-400 dark:text-slate-600 text-sm">
                <p>
                    © {new Date().getFullYear()}{' '}
                    <a href="https://deepvoiceai.co" rel="noopener" target="_blank">
                        Deep Voice AI Limited
                    </a>
                    . All rights reserved.
                </p>
            </footer>
        </div>
    );
}
