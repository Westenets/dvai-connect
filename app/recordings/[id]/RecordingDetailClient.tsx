'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Share2,
    Download,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    MessageSquare,
    CheckCircle2,
    Info,
    Sparkles,
    Clock,
    Users,
    Calendar,
    MoreHorizontal,
    Settings,
    ChevronRight,
    Search,
    SkipBack,
    SkipForward,
    Languages,
    Speech,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/lib/components/Header';
import { Footer } from '@/lib/components/Footer';

interface RecordingDetailClientProps {
    recording: any;
}

type Tab = 'summary' | 'transcript' | 'questions' | 'chat' | 'tasks' | 'info';

const MOCK_TRANSCRIPT = [
    {
        speaker: 'Sarah Chen',
        time: '00:12',
        text: "Good morning everyone. Let's start by looking at our Q4 cloud infrastructure goals. We need to ensure that the transition happens without any service disruption.",
    },
    {
        speaker: 'Mike Ross',
        time: '02:45',
        text: "I've completed the preliminary security audit. There are a few open items regarding the API gateway configuration, but nothing that should block the initial phase.",
    },
    {
        speaker: 'Sarah Chen',
        time: '14:02',
        text: "That's a valid point, Mike. If we look at the latency charts from last night's stress test, we can see where the bottleneck is starting to form.",
        isHighlighted: true,
    },
    {
        speaker: 'Alex Reed',
        time: '18:28',
        text: 'Can we verify the fallback procedure for the EU region? Last time we did a dry run, the DNS propagation took longer than expected.',
    },
    {
        speaker: 'Sarah Chen',
        time: '19:15',
        text: 'Excellent question. We have updated the TTL settings for all primary records to 60 seconds to mitigate exactly that risk.',
    },
];

const MOCK_ACTION_ITEMS = [
    {
        id: 1,
        text: 'Update roadmap with revised dates',
        assignee: 'Alex',
        due: 'Tomorrow',
        completed: false,
    },
    {
        id: 2,
        text: 'Coordinate with Design on Glass tokens',
        assignee: 'Sarah',
        due: 'Friday',
        completed: false,
    },
    {
        id: 3,
        text: 'Send meeting invite to Stakeholders',
        assignee: 'Mike',
        due: 'Completed',
        completed: true,
    },
];

export default function RecordingDetailClient({ recording }: RecordingDetailClientProps) {
    const router = useRouter();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<Tab>('summary');
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showSpeedOptions, setShowSpeedOptions] = useState(false);
    const [volume, setVolume] = useState(1);
    const speedMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Video Logic
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateProgress = () => {
            setCurrentTime(video.currentTime);
            setProgress((video.currentTime / video.duration) * 100);
        };

        const onLoadedMetadata = () => setDuration(video.duration);

        video.addEventListener('timeupdate', updateProgress);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        return () => {
            video.removeEventListener('timeupdate', updateProgress);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, []);

    // Volume & Mute logic
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume;
        }
    }, [isMuted, volume]);

    // Click Outside Speed Menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
                setShowSpeedOptions(false);
            }
        };

        if (showSpeedOptions) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSpeedOptions]);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play().catch((e) => console.error('Error playing video:', e));
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = (Number(e.target.value) / 100) * duration;
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setProgress(Number(e.target.value));
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = Number(e.target.value) / 100;
        setVolume(newVolume);
        if (newVolume > 0) setIsMuted(false);
    };

    const handleTranscriptSeek = (timeStr: string) => {
        if (!videoRef.current) return;
        const [mins, secs] = timeStr.split(':').map(Number);
        const time = mins * 60 + secs;
        videoRef.current.currentTime = time;
        if (!isPlaying) {
            videoRef.current.play().catch(console.error);
            setIsPlaying(true);
        }
    };

    const handleSpeedChange = (speed: number) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
            setShowSpeedOptions(false);
        }
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
    };

    const handleDownload = () => {
        alert('Download starting... (This is a mock, in production this would trigger the file download)');
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleBack = () => router.back();

    return (
        <div className="min-h-screen bg-white dark:bg-[#101922] text-slate-900 dark:text-slate-100 flex flex-col overflow-y-auto">
            <Header isMobile={isMobile} />

            <main className="grow container mx-auto px-4 py-6 md:py-10">
                <div className="flex flex-col h-full">
                    {/* Top Navigation */}
                    <div className="flex items-center justify-between mb-4 px-2">
                        <button
                            onClick={handleBack}
                            className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all border-0 bg-transparent cursor-pointer text-slate-600 dark:text-slate-300"
                        >
                            <ArrowLeft className="size-5" />
                            {!isMobile && (
                                <span className="text-sm font-medium">Back to Recordings</span>
                            )}
                        </button>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleShare}
                                className="size-10 rounded-2xl bg-white dark:bg-slate-800/50 hover:bg-[#00a8a8]/10 text-slate-500 dark:text-slate-400 hover:text-[#00a8a8] flex items-center justify-center border border-slate-200 dark:border-slate-700/50 cursor-pointer transition-all shadow-sm dark:shadow-none"
                            >
                                <Share2 className="size-4" />
                            </button>
                            <button 
                                onClick={handleDownload}
                                className="size-10 rounded-2xl bg-white dark:bg-slate-800/50 hover:bg-[#00a8a8]/10 text-slate-500 dark:text-slate-400 hover:text-[#00a8a8] flex items-center justify-center border border-slate-200 dark:border-slate-700/50 cursor-pointer transition-all shadow-sm dark:shadow-none"
                            >
                                <Download className="size-4" />
                            </button>
                        </div>
                    </div>

                    <div
                        className={cn(
                            'grid gap-6 grow',
                            isMobile ? 'grid-cols-1' : 'grid-cols-[1fr_360px]',
                        )}
                    >
                        {/* Main Content (Left Column) */}
                        <div className="flex flex-col gap-6">
                            {/* Header Info */}
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded bg-[#00a8a8]/20 text-[#00a8a8] text-[10px] uppercase font-bold tracking-wider">
                                        Recording
                                    </span>
                                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                        {recording.$createdAt
                                            ? format(
                                                  new Date(recording.$createdAt),
                                                  'MMM dd, yyyy • hh:mm a',
                                              )
                                            : 'Unknown Date'}
                                    </span>
                                </div>
                                <h1 className="text-2xl md:text-3xl font-bold bg-linear-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
                                    {recording.room_name || 'Meeting Recording'}
                                </h1>
                                <div className="flex items-center gap-4 mt-3">
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map((i) => (
                                            <div
                                                key={i}
                                                className="size-7 rounded-full border-2 border-white dark:border-[#101922] bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden"
                                            >
                                                <img
                                                    src={`https://i.pravatar.cc/100?u=${i}`}
                                                    alt="User"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ))}
                                        <div className="size-7 rounded-full border-2 border-white dark:border-[#101922] bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                            +3
                                        </div>
                                    </div>
                                    <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                                        6 Participants
                                    </span>
                                </div>
                            </div>

                            {/* Video Player Section */}
                            <div
                                ref={containerRef}
                                className="relative group rounded-3xl overflow-hidden bg-black aspect-video shadow-2xl border border-slate-800/50"
                                onMouseEnter={() => setShowControls(true)}
                                onMouseLeave={() => !isPlaying && setShowControls(true)}
                            >
                                <video
                                    ref={videoRef}
                                    src={recording.recording_url}
                                    className="w-full h-full object-contain"
                                    onClick={togglePlay}
                                    poster={recording.thumbnail}
                                />

                                {/* Custom Controls Overlay */}
                                <div
                                    className={cn(
                                        'absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/40 to-transparent p-6 pt-12 transition-all duration-300',
                                        showControls || !isPlaying
                                            ? 'translate-y-0 opacity-100'
                                            : 'translate-y-4 opacity-0 pointer-events-none',
                                    )}
                                >
                                    {/* Progress Bar */}
                                    <div className="relative w-full h-1.5 bg-slate-700/50 rounded-full mb-4 group/progress cursor-pointer">
                                        <div
                                            className="absolute top-0 left-0 h-full bg-[#00a8a8] rounded-full transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={progress || 0}
                                            onChange={handleSeek}
                                            className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                            title="Seek"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={togglePlay}
                                                className="size-10 rounded-full bg-[#00a8a8] text-white flex items-center justify-center border-0 cursor-pointer shadow-lg shadow-[#00a8a8]/20 transition-transform hover:scale-105 active:scale-95"
                                                title={isPlaying ? 'Pause' : 'Play'}
                                            >
                                                {isPlaying ? (
                                                    <Pause className="size-5 fill-current" />
                                                ) : (
                                                    <Play className="size-5 fill-current ml-0.5" />
                                                )}
                                            </button>
                                            <button
                                                className="p-2 text-white/70 hover:text-white border-0 bg-transparent cursor-pointer transition-colors"
                                                title="Skip Back"
                                            >
                                                <SkipBack className="size-5" />
                                            </button>
                                            <button
                                                className="p-2 text-white/70 hover:text-white border-0 bg-transparent cursor-pointer transition-colors"
                                                title="Skip Forward"
                                            >
                                                <SkipForward className="size-5" />
                                            </button>
                                            <div className="flex items-center gap-2 group/vol ml-2">
                                                <button
                                                    onClick={() => setIsMuted(!isMuted)}
                                                    className="p-1.5 text-white/70 hover:text-white border-0 bg-transparent cursor-pointer transition-colors"
                                                    title={isMuted ? 'Unmute' : 'Mute'}
                                                >
                                                    {isMuted ? (
                                                        <VolumeX className="size-5" />
                                                    ) : (
                                                        <Volume2 className="size-5" />
                                                    )}
                                                </button>
                                                <div className="w-0 group-hover/vol:w-20 overflow-hidden transition-all duration-300 ease-in-out">
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={isMuted ? 0 : volume * 100}
                                                        onChange={handleVolumeChange}
                                                        className="w-16 h-1 accent-[#00a8a8] cursor-pointer"
                                                        title="Volume"
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-xs font-mono text-white/80 ml-2">
                                                {isMobile
                                                    ? formatTime(duration)
                                                    : `${formatTime(currentTime)} / ${formatTime(duration)}`}
                                            </span>
                                        </div>

                                       
                                            <div className="flex items-center gap-4 text-white/70">
                                                {!isMobile && (
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setShowSpeedOptions(!showSpeedOptions)}
                                                            className="p-1.5 text-white/70 hover:text-white border-0 bg-transparent cursor-pointer text-xs font-bold uppercase tracking-wider min-w-[40px]"
                                                            title="Playback Speed"
                                                        >
                                                            {playbackSpeed}x
                                                        </button>
                                                        {showSpeedOptions && (
                                                            <div 
                                                                ref={speedMenuRef}
                                                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 p-1 flex flex-col min-w-[60px] z-50 shadow-2xl"
                                                            >
                                                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                                                                    <button
                                                                        key={speed}
                                                                        onClick={() => handleSpeedChange(speed)}
                                                                        className={cn(
                                                                            "px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-colors text-left",
                                                                            playbackSpeed === speed ? "bg-[#00a8a8] text-white" : "bg-transparent text-slate-400 hover:bg-slate-800 hover:text-white"
                                                                        )}
                                                                    >
                                                                        {speed}x
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={toggleFullscreen}
                                                    className="p-1.5 text-white/70 hover:text-white border-0 bg-transparent cursor-pointer"
                                                    title="Fullscreen"
                                                >
                                                    <Maximize className="size-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                {/* Large Center Play Button */}
                                {!isPlaying && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <button
                                            onClick={togglePlay}
                                            className="size-20 rounded-full bg-[#00a8a8]/90 text-white flex items-center justify-center border-0 cursor-pointer shadow-2xl backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
                                            title="Play Video"
                                        >
                                            <Play className="size-10 fill-current ml-1" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Summary & Insights area (Desktop view) */}
                            {!isMobile && (
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-slate-50 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800/50">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Sparkles className="size-5 text-[#00a8a8]" />
                                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Key Summary</h3>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            The team discussed the Q4 launch timeline, specifically
                                            focusing on the new glassmorphism engine. Key technical
                                            hurdles in mobile rendering were identified, and Sarah
                                            proposed a new caching strategy to improve performance
                                            by 40%.
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-6">
                                            {[
                                                '#infrastructure',
                                                '#strategy-q4',
                                                '#security-audit',
                                            ].map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="px-3 py-1 rounded-full bg-white dark:bg-slate-800/50 text-[10px] font-medium text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50 shadow-sm"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800/50">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="size-5 text-[#00a8a8]" />
                                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Action Items</h3>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500 font-bold uppercase tracking-tight">
                                                3 Pending
                                            </span>
                                        </div>
                                        <div className="space-y-4">
                                            {MOCK_ACTION_ITEMS.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-start gap-3 group"
                                                >
                                                    <div
                                                        className={cn(
                                                            'size-5 rounded-full border flex items-center justify-center mt-0.5 transition-colors',
                                                            item.completed
                                                                ? 'bg-[#00a8a8] border-[#00a8a8] text-white'
                                                                : 'border-slate-300 dark:border-slate-700 group-hover:border-[#00a8a8]/50 bg-white dark:bg-slate-800',
                                                        )}
                                                    >
                                                        {item.completed && (
                                                            <CheckCircle2 className="size-3" />
                                                        )}
                                                    </div>
                                                    <div className="grow">
                                                        <p
                                                            className={cn(
                                                                'text-sm font-medium',
                                                                item.completed
                                                                    ? 'text-slate-400 line-through'
                                                                    : 'text-slate-800 dark:text-slate-300',
                                                            )}
                                                        >
                                                            {item.text}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] text-slate-500">
                                                                Assignee: {item.assignee}
                                                            </span>
                                                            {item.due && !item.completed && (
                                                                <span className="text-[10px] text-[#00a8a8] font-bold">
                                                                    Due {item.due}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar (Desktop) or Tab Content (Mobile) */}
                        <div className="flex flex-col gap-6">
                            {isMobile ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-x-auto no-scrollbar">
                                        {(['summary', 'transcript', 'questions'] as const).map(
                                            (tab) => (
                                                <button
                                                    key={tab}
                                                    onClick={() => setActiveTab(tab)}
                                                    className={cn(
                                                        'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border-0 cursor-pointer capitalize',
                                                        activeTab === tab
                                                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl'
                                                            : 'bg-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                                                    )}
                                                >
                                                    {tab}
                                                </button>
                                            ),
                                        )}
                                    </div>
                                    <div className="mt-2">
                                        {activeTab === 'summary' && (
                                            <div className="space-y-6">
                                                <div className="bg-slate-50 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800/50 shadow-sm">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Sparkles className="size-5 text-[#00a8a8]" />
                                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">
                                                            AI Summary
                                                        </h3>
                                                    </div>
                                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                                        The team discussed the Q4 launch timeline,
                                                        specifically focusing on the new
                                                        glassmorphism engine. Key technical hurdles
                                                        in mobile rendering were identified, and
                                                        Sarah proposed a new caching strategy to
                                                        improve performance by 40%.
                                                    </p>
                                                </div>
                                                <div className="space-y-4 px-2 pb-24">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircle2 className="size-5 text-[#00a8a8]" />
                                                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">
                                                                Action Items
                                                            </h3>
                                                        </div>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-tight">
                                                            3 PENDING
                                                        </span>
                                                    </div>
                                                    {MOCK_ACTION_ITEMS.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-3xl border border-slate-200 dark:border-slate-800/50 flex items-start gap-4 shadow-sm"
                                                        >
                                                            <div className={cn(
                                                                "size-6 rounded-full border-2 flex items-center justify-center mt-0.5",
                                                                item.completed ? "bg-[#00a8a8] border-[#00a8a8]" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                                                            )}>
                                                                {item.completed && <CheckCircle2 className="size-3 text-white" />}
                                                            </div>
                                                            <div className="grow">
                                                                <p className={cn(
                                                                    "text-sm font-semibold",
                                                                    item.completed ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"
                                                                )}>{item.text}</p>
                                                                <div className="flex items-center gap-3 mt-1.5">
                                                                    <span className="text-[10px] text-slate-500">
                                                                        Assigned to: {item.assignee}
                                                                    </span>
                                                                    {item.due && !item.completed && (
                                                                        <span className="text-[10px] text-[#00a8a8] font-bold">
                                                                            Due {item.due}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {activeTab === 'transcript' && (
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                <TranscriptList
                                                    transcript={MOCK_TRANSCRIPT}
                                                    onSeek={handleTranscriptSeek}
                                                />
                                            </div>
                                        )}
                                        {activeTab === 'questions' && (
                                            <div className="p-10 text-center flex flex-col items-center gap-4 text-slate-500">
                                                <MoreHorizontal className="size-10 opacity-20" />
                                                <p className="text-sm font-medium">
                                                    No specific questions were identified by the AI
                                                    in this session.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl flex flex-col h-[700px] border border-slate-200 dark:border-slate-800/50 overflow-hidden sticky top-24 shadow-sm dark:shadow-none">
                                    <div className="p-6 border-b border-slate-200 dark:border-slate-800/50">
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Meeting Details</h3>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="size-2 rounded-full bg-[#00a8a8] animate-pulse" />
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                                                    AI Insights Ready
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950/30 mx-4 mt-4 rounded-2xl border border-slate-200 dark:border-transparent">
                                            {(['transcript', 'insights', 'questions'] as const).map(
                                                (tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() =>
                                                            setActiveTab(
                                                                tab === 'insights'
                                                                    ? 'summary'
                                                                    : (tab as any),
                                                            )
                                                        }
                                                        className={cn(
                                                            'flex-1 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all border-0 cursor-pointer',
                                                            activeTab ===
                                                                (tab === 'insights' ? 'summary' : tab)
                                                                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                                                                : 'bg-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-400',
                                                        )}
                                                    >
                                                        {tab}
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                        <div className="grow overflow-y-auto p-4 custom-scrollbar">
                                            {activeTab === 'transcript' || activeTab === 'summary' ? (
                                                <TranscriptList 
                                                    transcript={MOCK_TRANSCRIPT} 
                                                    onSeek={handleTranscriptSeek}
                                                />
                                            ) : (
                                                <div className="h-full flex items-center justify-center p-8 text-center text-slate-400 dark:text-slate-600">
                                                    <p className="text-xs italic">
                                                        No specific questions were identified.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-transparent">
                                            <div className="bg-white dark:bg-[#00a8a8]/10 hover:bg-slate-100 dark:hover:bg-[#00a8a8]/20 transition-all p-4 rounded-2xl flex items-center justify-between group cursor-pointer border border-slate-200 dark:border-[#00a8a8]/20 shadow-sm dark:shadow-none">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-lg bg-[#00a8a8]/20 flex items-center justify-center">
                                                        <Info className="size-4 text-[#00a8a8]" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                            4 Questions Identified
                                                        </p>
                                                        <p className="text-[10px] text-slate-500">
                                                            Asked during the session
                                                        </p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="size-4 text-slate-400 dark:text-slate-600 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                            )}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Mobile Bottom Navigation Bar */}
                {isMobile && (
                    <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/80 backdrop-blur-2xl border-t border-slate-200 dark:border-slate-800/80 px-6 pt-2 pb-6 flex items-center justify-between z-50 rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
                        {[
                            { id: 'video', label: 'Video', icon: Play },
                            { id: 'chat', label: 'Chat', icon: MessageSquare },
                            { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
                            { id: 'info', label: 'Info', icon: Info },
                        ].map((nav) => (
                            <button
                                key={nav.id}
                                onClick={() => setActiveTab(nav.id as Tab)}
                                className={cn(
                                    'flex flex-col items-center gap-1.5 p-2 transition-all border-0 bg-transparent cursor-pointer',
                                    activeTab === nav.id ? 'text-[#00a8a8]' : 'text-slate-500 dark:text-slate-500',
                                )}
                                title={nav.label}
                            >
                                <nav.icon
                                    className={cn(
                                        'size-6',
                                        activeTab === nav.id && 'fill-[#00a8a8]/20',
                                    )}
                                />
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                    {nav.label}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

            <Footer />
        </div>
    );
}

function TranscriptList({ transcript, onSeek }: { transcript: any[]; onSeek?: (time: string) => void }) {
    return (
        <div className="space-y-6 px-2">
            {transcript.map((item, idx) => (
                <div
                    key={idx}
                    onClick={() => onSeek?.(item.time)}
                    className={cn(
                        'p-4 rounded-2xl transition-all cursor-pointer group/item',
                        item.isHighlighted
                            ? 'bg-[#00a8a8]/10 border border-[#00a8a8]/20 shadow-lg shadow-[#00a8a8]/5'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/30',
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#00a8a8]">{item.speaker}</span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-[#00a8a8] group-hover/item:border-[#00a8a8]/30 transition-colors">
                            <Clock className="size-3" />
                            <span className="text-[10px] font-mono font-bold">
                                {item.time}
                            </span>
                        </div>
                    </div>
                    <p
                        className={cn(
                            'text-sm leading-relaxed',
                            item.isHighlighted ? 'text-slate-900 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400',
                        )}
                    >
                        {item.text}
                    </p>
                </div>
            ))}
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
