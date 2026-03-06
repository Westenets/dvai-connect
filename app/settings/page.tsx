'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { storage, account } from '@/lib/appwrite';
import { ID } from 'appwrite';
import toast from 'react-hot-toast';
import { LocalVideoTrack, createLocalVideoTrack } from 'livekit-client';
import languages from '@/lib/constants/languages.json';
import speechLanguages from '@/lib/constants/speech-languages.json';
import { useMediaDevices } from 'react-use';

interface Device {
    deviceId: string;
    groupId: string;
    kind: string;
    label: string;
}

function CameraPreview({ deviceId, mirror }: { deviceId?: string; mirror?: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [track, setTrack] = useState<LocalVideoTrack | null>(null);

    useEffect(() => {
        let active = true;
        let newTrack: LocalVideoTrack | null = null;

        const init = async () => {
            try {
                newTrack = await createLocalVideoTrack({
                    deviceId: deviceId === 'default' ? undefined : deviceId,
                });
                if (active) {
                    setTrack(newTrack);
                } else {
                    newTrack.stop();
                }
            } catch (e) {
                console.error('Failed to create local video track', e);
            }
        };
        init();

        return () => {
            active = false;
            if (newTrack) newTrack.stop();
        };
    }, [deviceId]);

    useEffect(() => {
        if (track && videoRef.current) {
            track.attach(videoRef.current);
        }
        return () => {
            if (track) {
                track.detach();
            }
        };
    }, [track]);

    return (
        <video
            ref={videoRef}
            className={`w-full h-full object-cover ${mirror ? '-scale-x-100' : ''}`}
            muted
            playsInline
        />
    );
}

export default function Settings() {
    const { user, isLoading, logout, updatePrefs } = useAuth();
    const router = useRouter();

    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [activeTab, setActiveTab] = useState('General');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

    const devicesState = useMediaDevices();
    const devices = (devicesState as any)?.devices || [];
    const videoDevices = devices.filter((d: any) => d.kind === 'videoinput');
    const audioInputDevices = devices.filter((d: any) => d.kind === 'audioinput');
    const audioOutputDevices = devices.filter((d: any) => d.kind === 'audiooutput');

    // General Settings State
    const [language, setLanguage] = useState('en');
    const [voiceLanguage, setVoiceLanguage] = useState('en');
    const [appearance, setAppearance] = useState('system');
    const [reportDiagnostics, setReportDiagnostics] = useState(true);

    // Audio Settings State
    const [audioInputDevice, setAudioInputDevice] = useState('default');
    const [audioOutputDevice, setAudioOutputDevice] = useState('default');
    const [noiseCancellation, setNoiseCancellation] = useState(false);
    const [echoReduction, setEchoReduction] = useState(false);

    // Video Settings State
    const [videoInputDevice, setVideoInputDevice] = useState('default');
    const [videoQuality, setVideoQuality] = useState('720');
    const [adjustForLowLight, setAdjustForLowLight] = useState(true);
    const [mirrorVideo, setMirrorVideo] = useState(false);

    // Notifications Settings State
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [soundAlerts, setSoundAlerts] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(false);
    const [doNotDisturb, setDoNotDisturb] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const TABS = [
        { id: 'General', icon: 'settings', label: 'General' },
        { id: 'Audio', icon: 'mic', label: 'Audio' },
        { id: 'Video', icon: 'videocam', label: 'Video' },
        { id: 'Account', icon: 'account_circle', label: 'Account' },
        { id: 'Notifications', icon: 'notifications', label: 'Notifications' },
    ];

    const tabIdToLabel = (id: string) => TABS.find((t) => t.id === id)?.label || id;

    const isFirstRender = useRef(true);
    const userLoadedRef = useRef(false);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        } else if (user && !userLoadedRef.current) {
            userLoadedRef.current = true;
            setName(user.name);
            const prefs = user.prefs as Record<string, any>;

            if (prefs?.avatarUrl) setAvatarPreview(prefs.avatarUrl);

            // Load Settings
            if (prefs?.language) setLanguage(prefs.language);
            if (prefs?.voiceLanguage) setVoiceLanguage(prefs.voiceLanguage);
            if (prefs?.appearance) setAppearance(prefs.appearance);
            if (prefs?.reportDiagnostics !== undefined)
                setReportDiagnostics(prefs.reportDiagnostics);
            if (prefs?.audioInputDevice) setAudioInputDevice(prefs.audioInputDevice);
            if (prefs?.audioOutputDevice) setAudioOutputDevice(prefs.audioOutputDevice);
            if (prefs?.noiseCancellation !== undefined)
                setNoiseCancellation(prefs.noiseCancellation);
            if (prefs?.echoReduction !== undefined) setEchoReduction(prefs.echoReduction);
            if (prefs?.videoInputDevice) setVideoInputDevice(prefs.videoInputDevice);
            if (prefs?.videoQuality) setVideoQuality(prefs.videoQuality);
            if (prefs?.adjustForLowLight !== undefined)
                setAdjustForLowLight(prefs.adjustForLowLight);
            if (prefs?.mirrorVideo !== undefined) setMirrorVideo(prefs.mirrorVideo);
            if (prefs?.emailNotifications !== undefined)
                setEmailNotifications(prefs.emailNotifications);
            if (prefs?.soundAlerts !== undefined) setSoundAlerts(prefs.soundAlerts);
            if (prefs?.pushNotifications !== undefined)
                setPushNotifications(prefs.pushNotifications);
            if (prefs?.doNotDisturb !== undefined) setDoNotDisturb(prefs.doNotDisturb);

            // Delay setting isFirstRender to false to prevent initial setup from triggering auto-save
            setTimeout(() => {
                isFirstRender.current = false;
            }, 500);
        }
    }, [user, isLoading, router]);

    // Auto-Save Effect for Non-Account Tabs
    useEffect(() => {
        if (isFirstRender.current || isLoading || !user) return;

        const timeoutId = setTimeout(async () => {
            try {
                const newPrefs: Record<string, any> = {
                    ...(user.prefs || {}),
                    language,
                    voiceLanguage,
                    appearance,
                    reportDiagnostics,
                    audioInputDevice,
                    audioOutputDevice,
                    noiseCancellation,
                    echoReduction,
                    videoInputDevice,
                    videoQuality,
                    adjustForLowLight,
                    mirrorVideo,
                    emailNotifications,
                    soundAlerts,
                    pushNotifications,
                    doNotDisturb,
                };

                // Filter out undefined values
                Object.keys(newPrefs).forEach(
                    (key) => newPrefs[key] === undefined && delete newPrefs[key],
                );

                // Ensure we actually check if the object differs to prevent endless loops with Appwrite's response delay but `user.prefs` should handle it.
                await updatePrefs(newPrefs);
                toast.success('Settings auto-saved');
            } catch (error: any) {
                toast.error(`Auto-save failed: ${error.message}`);
            }
        }, 1000); // Debounce auto-save by 1 second

        return () => clearTimeout(timeoutId);
    }, [
        language,
        voiceLanguage,
        appearance,
        reportDiagnostics,
        audioInputDevice,
        audioOutputDevice,
        noiseCancellation,
        echoReduction,
        videoInputDevice,
        videoQuality,
        adjustForLowLight,
        mirrorVideo,
        emailNotifications,
        soundAlerts,
        pushNotifications,
        doNotDisturb,
    ]);

    if (isLoading || !user) {
        return (
            <div className="min-h-screen bg-[#f5f7f8] dark:bg-[#101922] flex items-center justify-center text-slate-500">
                Loading settings...
            </div>
        );
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveAccount = async () => {
        setIsSaving(true);
        try {
            let madeChanges = false;
            if (name !== user.name) {
                await account.updateName(name);
                madeChanges = true;
            }

            let avatarUrl = (user.prefs as Record<string, any>)?.avatarUrl;

            if (selectedFile) {
                const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files';
                try {
                    const uploadedFile = await storage.createFile(
                        BUCKET_ID,
                        ID.unique(),
                        selectedFile,
                    );
                    const result = storage.getFileView(BUCKET_ID, uploadedFile.$id);
                    avatarUrl = result.toString();

                    const newPrefs: Record<string, any> = {
                        ...(user.prefs || {}),
                        avatarUrl,
                    };

                    Object.keys(newPrefs).forEach(
                        (key) => newPrefs[key] === undefined && delete newPrefs[key],
                    );
                    await updatePrefs(newPrefs);
                    madeChanges = true;
                } catch (error: any) {
                    toast.error(`Failed to upload avatar: ${error.message}`);
                    setIsSaving(false);
                    return;
                }
            }

            if (madeChanges) {
                toast.success('Account profile saved successfully!');
            } else {
                toast.success('No changes to save.');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to save profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!oldPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill in all password fields');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return;
        }

        setIsUpdatingPassword(true);
        try {
            await account.updatePassword(newPassword, oldPassword);
            toast.success('Password updated successfully!');
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.message || 'Failed to update password');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const initialLetter = name ? name.charAt(0).toUpperCase() : '?';

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex flex-col font-['Inter',sans-serif] text-slate-900 dark:text-slate-100 overflow-x-hidden">
            <div className="relative flex min-h-screen w-full overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 shrink-0 hidden md:flex flex-col bg-white dark:bg-[#1a2632] border-r border-slate-200 dark:border-slate-800">
                    <div className="p-6 pb-2 cursor-pointer" onClick={() => router.push('/')}>
                        <div className="flex items-center gap-3 mb-8">
                            <img
                                src="/images/livekit-meet-home.svg"
                                alt="DVAI Connect"
                                className="h-8 object-contain hidden dark:block"
                            />
                            <img
                                src="/images/livekit-meet-home-light.svg"
                                alt="DVAI Connect"
                                className="h-8 object-contain block dark:hidden"
                            />
                        </div>
                    </div>
                    <div className="mb-4">
                        <h2 className="px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-start gap-1">
                            <button
                                className="bg-transparent border-0 text-teal-600"
                                onClick={() => router.push('/')}
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    arrow_back
                                </span>
                            </button>
                            Settings
                        </h2>
                        <nav className="flex flex-col gap-1 px-3">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center w-full text-left gap-3 px-3 py-2.5 rounded-lg bg-transparent border-0 transition-colors ${
                                        activeTab === tab.id
                                            ? 'bg-[#00a8a8]/10 text-[#00a8a8] dark:bg-[#00a8a8]/20'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span
                                        className={`material-symbols-outlined text-[20px] ${
                                            activeTab === tab.id ? 'fill-1' : ''
                                        }`}
                                    >
                                        {tab.icon}
                                    </span>
                                    <span className="text-sm font-medium">{tab.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800">
                        <button
                            onClick={logout}
                            className="w-full flex items-center gap-3 px-3 py-2 bg-transparent border-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">logout</span>
                            <span className="text-sm font-medium">Log Out</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto bg-[#f5f7f8] dark:bg-[#101922] p-4 md:p-8 lg:p-12">
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-10 flex items-center gap-4">
                            <button
                                onClick={() => router.push('/')}
                                className="md:hidden flex items-center justify-center size-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[24px]">
                                    arrow_back
                                </span>
                            </button>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                                    {activeTab === 'Account' && 'Account Settings'}
                                    {activeTab === 'Video' && 'Video Settings'}
                                    {activeTab === 'Audio' && 'Audio Settings'}
                                    {activeTab === 'General' && 'General Settings'}
                                    {activeTab === 'Notifications' && 'Notification Settings'}
                                </h1>
                                <p className="text-slate-500 dark:text-slate-400">
                                    {activeTab === 'Account' &&
                                        'Manage your profile information and preferences.'}
                                    {activeTab === 'Video' &&
                                        'Configure your camera source and video quality preferences.'}
                                    {activeTab !== 'Account' &&
                                        activeTab !== 'Video' &&
                                        `Manage your ${tabIdToLabel(activeTab).toLowerCase()} settings.`}
                                </p>
                            </div>
                        </div>

                        {activeTab === 'Account' && (
                            <div className="grid grid-cols-1 gap-8">
                                {/* Profile Details */}
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Profile Details
                                    </h3>

                                    <div className="flex flex-col sm:flex-row gap-8 items-start">
                                        {/* Avatar Upload */}
                                        <div className="flex flex-col items-center gap-4">
                                            <div
                                                className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-700 shadow-md bg-slate-200 dark:bg-slate-600 bg-cover bg-center flex items-center justify-center text-4xl font-bold text-slate-500 dark:text-white relative group overflow-hidden"
                                                style={
                                                    avatarPreview
                                                        ? {
                                                              backgroundImage: `url("${avatarPreview}")`,
                                                          }
                                                        : {}
                                                }
                                            >
                                                {!avatarPreview && initialLetter}

                                                {/* Overlay */}
                                                <div
                                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    <span className="material-symbols-outlined text-white text-[32px]">
                                                        photo_camera
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="text-sm font-medium bg-transparent border-0 text-[#00a8a8] hover:underline"
                                            >
                                                Change Picture
                                            </button>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                            />
                                        </div>

                                        {/* Form Fields */}
                                        <div className="flex-1 space-y-6 w-full">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Display Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 outline-none shadow-sm py-2.5 px-3 transition-colors"
                                                />
                                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                                    This is how you will appear to other
                                                    participants in meetings.
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                    Email Address
                                                </label>
                                                <input
                                                    type="text"
                                                    value={user.email}
                                                    disabled
                                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 shadow-sm py-2.5 px-3 cursor-not-allowed"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-4 pt-4">
                                        <button
                                            onClick={() => router.push('/')}
                                            className="px-6 py-2.5 rounded-lg border-0 bg-transparent text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveAccount}
                                            disabled={isSaving}
                                            className="px-6 py-2.5 rounded-lg border-0 bg-[#00a8a8] hover:bg-[#005c5c] text-white font-medium shadow-md shadow-[#005c5c]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {isSaving && (
                                                <span className="material-symbols-outlined animate-spin text-[20px]">
                                                    progress_activity
                                                </span>
                                            )}
                                            Save Changes
                                        </button>
                                    </div>
                                </div>

                                {/* Change Password */}
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Change Password
                                    </h3>
                                    <div className="space-y-6 max-w-md">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                Current Password
                                            </label>
                                            <input
                                                type="password"
                                                value={oldPassword}
                                                onChange={(e) => setOldPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 outline-none shadow-sm py-2.5 px-3 transition-colors text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                New Password
                                            </label>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 outline-none shadow-sm py-2.5 px-3 transition-colors text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                Confirm New Password
                                            </label>
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 outline-none shadow-sm py-2.5 px-3 transition-colors text-sm"
                                            />
                                        </div>
                                        <div className="pt-2">
                                            <button
                                                onClick={handleUpdatePassword}
                                                disabled={isUpdatingPassword}
                                                className="px-6 py-2.5 rounded-lg border-0 bg-[#00a8a8] hover:bg-[#005c5c] text-white font-medium shadow-md shadow-[#005c5c]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                            >
                                                {isUpdatingPassword && (
                                                    <span className="material-symbols-outlined animate-spin text-[20px]">
                                                        progress_activity
                                                    </span>
                                                )}
                                                Update Password
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Video' && (
                            <div className="grid grid-cols-1 gap-8">
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Camera Preview
                                    </h3>

                                    {/* LiveKit Video Preview */}
                                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-6 group flex items-center justify-center">
                                        <CameraPreview
                                            deviceId={
                                                videoInputDevice === 'default'
                                                    ? undefined
                                                    : videoInputDevice
                                            }
                                            mirror={mirrorVideo}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Camera Source
                                            </label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                    <span className="material-symbols-outlined text-[20px]">
                                                        videocam
                                                    </span>
                                                </span>
                                                <select
                                                    value={videoInputDevice}
                                                    onChange={(e) =>
                                                        setVideoInputDevice(e.target.value)
                                                    }
                                                    className="pl-10 w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                >
                                                    <option value="default">Default Camera</option>
                                                    {videoDevices.map((device: Device) => (
                                                        <option
                                                            key={device.deviceId}
                                                            value={device.deviceId}
                                                        >
                                                            {device.label ||
                                                                `Camera ${device.deviceId.slice(0, 5)}...`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Select the camera you want to use for meetings.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Video Quality
                                            </label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                    <span className="material-symbols-outlined text-[20px]">
                                                        hd
                                                    </span>
                                                </span>
                                                <select
                                                    value={videoQuality}
                                                    onChange={(e) =>
                                                        setVideoQuality(e.target.value)
                                                    }
                                                    className="pl-10 w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                >
                                                    <option value="1080">
                                                        High Definition (1080p)
                                                    </option>
                                                    <option value="720">
                                                        Standard Definition (720p)
                                                    </option>
                                                </select>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Higher quality uses more bandwidth.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Advanced Settings
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        auto_awesome
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 dark:text-white my-0">
                                                        Adjust for low light
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Automatically brighten video in dark
                                                        environments.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={adjustForLowLight}
                                                    onChange={(e) =>
                                                        setAdjustForLowLight(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                        <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        blur_on
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Mirror my video
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        See yourself as others see you.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={mirrorVideo}
                                                    onChange={(e) =>
                                                        setMirrorVideo(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'General' && (
                            <div className="grid grid-cols-1 gap-8">
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Interface
                                    </h3>
                                    <div className="space-y-8">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-3">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Language
                                                </label>
                                                <div className="relative max-w-md">
                                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                        <span className="material-symbols-outlined text-[20px]">
                                                            language
                                                        </span>
                                                    </span>
                                                    <select
                                                        value={language}
                                                        onChange={(e) =>
                                                            setLanguage(e.target.value)
                                                        }
                                                        className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                    >
                                                        {Object.entries(languages).map(
                                                            ([code, [englishName, nativeName]]) => (
                                                                <option key={code} value={code}>
                                                                    {englishName} ({nativeName})
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    Select your preferred language for the
                                                    interface.
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Speech Language
                                                </label>
                                                <div className="relative max-w-md">
                                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                        <span className="material-symbols-outlined text-[20px]">
                                                            language
                                                        </span>
                                                    </span>
                                                    <select
                                                        value={voiceLanguage}
                                                        onChange={(e) =>
                                                            setVoiceLanguage(e.target.value)
                                                        }
                                                        className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                    >
                                                        {Object.entries(speechLanguages).map(
                                                            ([code, [englishName, nativeName]]) => (
                                                                <option key={code} value={code}>
                                                                    {englishName} ({nativeName})
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    Select your preferred spoken language for
                                                    auto-transation of chat and DVAI Agent. (Coming
                                                    soon)
                                                </p>
                                            </div>
                                        </div>

                                        <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>

                                        <div className="space-y-4">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Appearance
                                            </label>
                                            <div className="flex flex-wrap gap-4">
                                                {[
                                                    {
                                                        id: 'light',
                                                        label: 'Light',
                                                        cardBg: 'bg-slate-50 dark:bg-slate-900',
                                                        innerBg: 'bg-white',
                                                        innerBorder: 'border-slate-200',
                                                        icon: 'light_mode',
                                                        iconColor: 'text-slate-400',
                                                    },
                                                    {
                                                        id: 'dark',
                                                        label: 'Dark',
                                                        cardBg: 'bg-slate-50 dark:bg-slate-900',
                                                        innerBg: 'bg-[#1a2632]',
                                                        innerBorder: 'border-slate-700',
                                                        icon: 'dark_mode',
                                                        iconColor: 'text-slate-400',
                                                    },
                                                    {
                                                        id: 'system',
                                                        label: 'System Default',
                                                        cardBg: 'bg-slate-50 dark:bg-slate-900',
                                                        innerBg:
                                                            'bg-gradient-to-br from-white to-slate-900',
                                                        innerBorder:
                                                            'border-slate-300 dark:border-slate-600',
                                                        icon: 'settings_brightness',
                                                        iconColor:
                                                            'text-slate-500 mix-blend-difference',
                                                    },
                                                ].map((themeOption) => (
                                                    <div
                                                        key={themeOption.id}
                                                        className={`flex-1 min-w-[160px] relative group flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                                            appearance === themeOption.id
                                                                ? 'border-[#00a8a8] bg-[#00a8a8]/5 shadow-sm ring-1 ring-[#00a8a8]'
                                                                : `border-slate-200 dark:border-slate-700 hover:border-[#00a8a8] dark:hover:border-[#00a8a8] ${themeOption.cardBg}`
                                                        }`}
                                                        onClick={() =>
                                                            setAppearance(themeOption.id)
                                                        }
                                                    >
                                                        {appearance === themeOption.id && (
                                                            <div className="absolute top-3 right-3 text-[#00a8a8]">
                                                                <span
                                                                    className="material-symbols-outlined text-[20px]"
                                                                    style={{
                                                                        fontVariationSettings:
                                                                            "'FILL' 1",
                                                                    }}
                                                                >
                                                                    check_circle
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div
                                                            className={`w-full aspect-video rounded-lg border shadow-sm flex items-center justify-center mb-1 ${themeOption.innerBg} ${themeOption.innerBorder}`}
                                                        >
                                                            <span
                                                                className={`material-symbols-outlined text-4xl ${appearance === themeOption.id ? 'text-[#00a8a8]' : themeOption.iconColor}`}
                                                            >
                                                                {themeOption.icon}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className={`text-sm font-medium ${appearance === themeOption.id ? 'text-[#00a8a8]' : 'text-slate-700 dark:text-slate-300'}`}
                                                        >
                                                            {themeOption.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Diagnostics & Usage
                                    </h3>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                Report additional diagnostics
                                            </h4>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                                                Help us improve MeetNow by automatically sending
                                                anonymous performance reports and error logs. This
                                                data is never used to identify you.
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer mt-1">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={reportDiagnostics}
                                                onChange={(e) =>
                                                    setReportDiagnostics(e.target.checked)
                                                }
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Audio' && (
                            <div className="grid grid-cols-1 gap-8">
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Devices
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Microphone
                                            </label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                    <span className="material-symbols-outlined text-[20px]">
                                                        mic
                                                    </span>
                                                </span>
                                                <select
                                                    value={audioInputDevice}
                                                    onChange={(e) =>
                                                        setAudioInputDevice(e.target.value)
                                                    }
                                                    className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                >
                                                    <option value="default">
                                                        Default Microphone
                                                    </option>
                                                    {audioInputDevices.map((device: Device) => (
                                                        <option
                                                            key={device.deviceId}
                                                            value={device.deviceId}
                                                        >
                                                            {device.label ||
                                                                `Microphone ${device.deviceId.slice(0, 5)}...`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Speakers
                                            </label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                                    <span className="material-symbols-outlined text-[20px]">
                                                        volume_up
                                                    </span>
                                                </span>
                                                <select
                                                    value={audioOutputDevice}
                                                    onChange={(e) =>
                                                        setAudioOutputDevice(e.target.value)
                                                    }
                                                    className="pl-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#00a8a8] focus:ring-[#00a8a8] focus:ring-1 shadow-sm py-2.5 outline-none transition-colors"
                                                >
                                                    <option value="default">
                                                        Default Speakers
                                                    </option>
                                                    {audioOutputDevices.map((device: Device) => (
                                                        <option
                                                            key={device.deviceId}
                                                            value={device.deviceId}
                                                        >
                                                            {device.label ||
                                                                `Speaker ${device.deviceId.slice(0, 5)}...`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Audio Processing
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        noise_control_off
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Noise Cancellation
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Filter out background noise like typing or
                                                        traffic.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={noiseCancellation}
                                                    onChange={(e) =>
                                                        setNoiseCancellation(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                        <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        graphic_eq
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Echo Reduction
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Minimize echo when not using headphones.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={echoReduction}
                                                    onChange={(e) =>
                                                        setEchoReduction(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Notifications' && (
                            <div className="grid grid-cols-1 gap-8">
                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        General Alerts
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        email
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Email notifications
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Receive email reminders for upcoming
                                                        meetings.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={emailNotifications}
                                                    onChange={(e) =>
                                                        setEmailNotifications(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                        <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        volume_up
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Desktop sound alerts
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Play a sound when someone joins or leaves
                                                        the meeting.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={soundAlerts}
                                                    onChange={(e) =>
                                                        setSoundAlerts(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                        <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        chat
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900 my-0 dark:text-white">
                                                        Browser push notifications
                                                    </h4>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                        Show pop-up notifications when a meeting is
                                                        about to start.
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={pushNotifications}
                                                    onChange={(e) =>
                                                        setPushNotifications(e.target.checked)
                                                    }
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                                        Do Not Disturb
                                    </h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                                <span className="material-symbols-outlined text-[24px]">
                                                    do_not_disturb_on
                                                </span>
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-slate-900 myh-0 dark:text-white">
                                                    Pause all notifications
                                                </h4>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                    You won&apos;t receive warnings about upcoming
                                                    meetings or event changes.
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={doNotDisturb}
                                                onChange={(e) => setDoNotDisturb(e.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#00a8a8]/20 dark:peer-focus:ring-[#00a8a8]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-px after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#00a8a8] dark:peer-checked:bg-[#00a8a8]"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
