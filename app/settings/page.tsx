'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { storage, account } from '@/lib/appwrite';
import { ID } from 'appwrite';
import toast from 'react-hot-toast';
import Image from 'next/image';

export default function Settings() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('Account');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const TABS = [
    { id: 'General', icon: 'settings', label: 'General' },
    { id: 'Audio', icon: 'mic', label: 'Audio' },
    { id: 'Video', icon: 'videocam', label: 'Video' },
    { id: 'Account', icon: 'account_circle', label: 'Account' },
    { id: 'Notifications', icon: 'notifications', label: 'Notifications' },
  ];

  const tabIdToLabel = (id: string) => TABS.find((t) => t.id === id)?.label || id;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user) {
      setName(user.name);
      const prefs = user.prefs as Record<string, any>;
      if (prefs?.avatarUrl) {
        setAvatarPreview(prefs.avatarUrl);
      }
    }
  }, [user, isLoading, router]);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (name !== user.name) {
        await account.updateName(name);
      }

      let avatarUrl = (user.prefs as Record<string, any>)?.avatarUrl;

      if (selectedFile) {
        const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files';
        try {
          const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), selectedFile);
          const result = storage.getFileView(BUCKET_ID, uploadedFile.$id);
          avatarUrl = result.toString();
        } catch (error: any) {
          toast.error(`Failed to upload avatar: ${error.message}`);
          setIsSaving(false);
          return;
        }
      }

      await account.updatePrefs({
        ...(user.prefs || {}),
        avatarUrl,
      });

      toast.success('Settings saved successfully!');
      setTimeout(() => {
        window.location.reload(); // Refresh to ensure global state sees the new name/avatar
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const initialLetter = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex flex-col font-['Inter',_sans-serif] text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <div className="relative flex min-h-screen w-full overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 hidden md:flex flex-col bg-white dark:bg-[#1a2632] border-r border-slate-200 dark:border-slate-800">
          <div className="p-6 pb-2 cursor-pointer" onClick={() => router.push('/')}>
            <div className="flex items-center gap-3 mb-8">
              <img
                src="/images/livekit-meet-home.svg"
                alt="DVAI Connect"
                className="h-8 object-contain"
              />
            </div>
          </div>
          <div className="mb-4">
            <h2 className="px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Settings
            </h2>
            <nav className="flex flex-col gap-1 px-3">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center w-full text-left gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#258cf4]/10 text-[#258cf4] dark:bg-[#258cf4]/20'
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
              className="w-full flex items-center gap-3 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
                <span className="material-symbols-outlined text-[24px]">arrow_back</span>
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
                  {activeTab === 'Account' && 'Manage your profile information and preferences.'}
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
                        style={avatarPreview ? { backgroundImage: `url("${avatarPreview}")` } : {}}
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
                        className="text-sm font-medium text-[#258cf4] hover:underline"
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
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#258cf4] focus:ring-[#258cf4] focus:ring-1 outline-none shadow-sm py-2.5 px-3 transition-colors"
                        />
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          This is how you will appear to other participants in meetings.
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
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-lg bg-[#258cf4] hover:bg-blue-600 text-white font-medium shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
            )}

            {activeTab === 'Video' && (
              <div className="grid grid-cols-1 gap-8">
                <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                    Camera Preview
                  </h3>
                  <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-6 group flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-600 text-[64px]">
                      videocam
                    </span>
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Default Camera
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Camera Source
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <span className="material-symbols-outlined text-[20px]">videocam</span>
                        </span>
                        <select className="pl-10 w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#258cf4] focus:ring-[#258cf4] shadow-sm py-2.5 outline-none">
                          <option value="default">Default Camera</option>
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
                          <span className="material-symbols-outlined text-[20px]">hd</span>
                        </span>
                        <select className="pl-10 w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-[#258cf4] focus:ring-[#258cf4] shadow-sm py-2.5 outline-none">
                          <option value="1080">High Definition (1080p)</option>
                          <option value="720">Standard Definition (720p)</option>
                          <option value="360">Low Definition (360p)</option>
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
                          <h4 className="font-medium text-slate-900 dark:text-white">
                            Adjust for low light
                          </h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Automatically brighten video in dark environments.
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#258cf4]/20 dark:peer-focus:ring-[#258cf4]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#258cf4]"></div>
                      </label>
                    </div>
                    <div className="w-full h-px bg-slate-100 dark:bg-slate-800"></div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                          <span className="material-symbols-outlined text-[24px]">blur_on</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-white">
                            Mirror my video
                          </h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            See yourself as others see you.
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#258cf4]/20 dark:peer-focus:ring-[#258cf4]/30 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#258cf4]"></div>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                  <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button className="px-6 py-2.5 rounded-lg bg-[#258cf4] hover:bg-blue-600 text-white font-medium shadow-md shadow-blue-500/20 transition-all">
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {['General', 'Audio', 'Notifications'].includes(activeTab) && (
              <div className="bg-white dark:bg-[#1a2632] rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm flex flex-col items-center justify-center text-center py-20">
                <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600 mb-4">
                  construction
                </span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {tabIdToLabel(activeTab)} Settings
                </h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                  This settings area is part of the design but is currently under construction and
                  has no global state hooked up.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
