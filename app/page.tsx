'use client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { generateRoomId, randomString, encodePassphrase } from '@/lib/client-utils';
import { useAuth } from '@/components/AuthProvider';
import { databases } from '@/lib/appwrite';
import { ID, Query } from 'appwrite';
import toast from 'react-hot-toast';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import Link from 'next/link';
import { Header } from '@/lib/components/Header';
import { Footer } from '@/lib/components/Footer';
import { RecordingCard } from '@/lib/components/RecordingCard';

export default function Dashboard() {
    const router = useRouter();
    const { user, isLoading, logout } = useAuth();
    const prefs = user?.prefs as Record<string, any>;

    const [roomCode, setRoomCode] = useState('');
    const [newMeetingOpen, setNewMeetingOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [recordings, setRecordings] = useState<any[]>([]);
    const [isLoadingRecordings, setIsLoadingRecordings] = useState(true);

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
        const fetchRecordings = async () => {
            if (!user?.$id) return;
            try {
                const response = await databases.listDocuments('dvai-connect', 'recordings', [
                    Query.contains('participant_ids', user.$id),
                    Query.orderDesc('$createdAt'),
                    Query.limit(3),
                ]);
                setRecordings(response.documents);
            } catch (error) {
                console.error('Failed to fetch recordings:', error);
            } finally {
                setIsLoadingRecordings(false);
            }
        };

        if (user?.$id) {
            fetchRecordings();
        }
    }, [user?.$id]);

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

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex flex-col font-['Inter',sans-serif] text-slate-900 dark:text-slate-100 overflow-x-hidden">
            <Header isMobile={isMobile} />

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
                                    className="bg-[#00a8a8] text-white hover:bg-[#008c8c] border-0 font-semibold px-4 py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        {/* SwiperSlides remain here as they are part of home-specific hero */}
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
                                    host. End-to-end encryption ensures privacy, even the host
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

            {/* Recordings Section */}
            <div className="w-full max-w-[1440px] mx-auto px-6 md:px-12 pb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-base md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#00a8a8]">history</span>
                        Recent Recordings
                        {recordings.length > 0 && (
                            <span className="text-sm text-white bg-[#00a8a8] px-1 py-0.5 md:px-2.5 md:py-1 rounded-full">
                                {recordings.length > 9 ? '9+' : recordings.length}
                            </span>
                        )}
                    </h2>
                    {recordings.length > 0 && (
                        <Link
                            href="/recordings"
                            className="text-sm text-slate-500 bg-slate-100 dark:text-slate-100 dark:bg-slate-800 hover:bg-[#00a8a8] dark:hover:bg-[#00a8a8] hover:text-white transition-all px-3 py-1 rounded-full no-underline"
                        >
                            View All
                        </Link>
                    )}
                </div>

                {isLoadingRecordings ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-40 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl"
                            ></div>
                        ))}
                    </div>
                ) : recordings.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {recordings.map((rec) => (
                            <RecordingCard 
                                key={rec.$id} 
                                rec={rec} 
                                user={user} 
                                onDelete={(id) => setRecordings((prev) => prev.filter((r) => r.$id !== id))}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-[#15202b] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
                        <div className="size-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <span className="material-symbols-outlined text-[32px]">movie_off</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                            No recordings yet
                        </h3>
                        <p className="text-slate-500 dark:text-slate-500 max-w-xs mx-auto mt-2">
                            When you record a meeting, it will appear here for you to watch or
                            share.
                        </p>
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
}
