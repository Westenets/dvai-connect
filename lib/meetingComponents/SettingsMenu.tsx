'use client';
import * as React from 'react';
import { useMaybeLayoutContext, MediaDeviceMenu } from '@livekit/components-react';
import { Camera, Mic, Speaker, X, Settings2, Subtitles } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CameraSettings } from '@/lib/components/CameraSettings';
import { MicrophoneSettings } from '@/lib/components/MicrophoneSettings';
import { SpeakerSettings } from './SpeakerSettings';

/**
 * @alpha
 */
export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * @alpha
 */
export function SettingsMenu(props: SettingsMenuProps) {
    const layoutContext = useMaybeLayoutContext();
    const settingsRef = React.useRef<null | HTMLDivElement>(null);
    const { user, updatePrefs } = useAuth();
    const prefs = user?.prefs as Record<string, any>;
    const [captionSize, setCaptionSize] = React.useState(prefs?.captionSize ?? 1);

    const handleCaptionSizeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setCaptionSize(val);
        if (user) {
            await updatePrefs({ ...prefs, captionSize: val });
        }
    };

    return (
        <div
            className="settings-menu-container"
            onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
        >
            <div
                className="w-full bg-(--lk-bg)/75 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200/50 dark:border-white/10 overflow-hidden animate-in slide-in-from-bottom-5 duration-300"
                onClick={(e) => e.stopPropagation()}
                {...props}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200/20 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-[#00a8a8]" />
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                            Settings
                        </h2>
                    </div>
                    <button
                        onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
                        className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors border-0 bg-transparent text-slate-500 dark:text-slate-400"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div
                    ref={settingsRef}
                    className="p-4 max-h-[70vh] overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col gap-6"
                >
                    {/* Camera Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            <Camera className="w-4 h-4" />
                            <span>Camera</span>
                        </div>
                        <div className="bg-slate-100/50 dark:bg-white/5 rounded-xl p-3 border border-slate-200/30 dark:border-white/5">
                            <CameraSettings />
                        </div>
                    </div>

                    {/* Microphone Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            <Mic className="w-4 h-4" />
                            <span>Microphone</span>
                        </div>
                        <div className="bg-slate-100/50 dark:bg-white/5 rounded-xl p-3 border border-slate-200/30 dark:border-white/5">
                            <MicrophoneSettings />
                        </div>
                    </div>

                    {/* Speaker Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            <Speaker className="w-4 h-4" />
                            <span>Speaker & Headphones</span>
                        </div>
                        <SpeakerSettings settingsRef={settingsRef} />
                    </div>

                    {/* Captions Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            <Subtitles className="w-4 h-4" />
                            <span>Closed Captions</span>
                        </div>
                        <div className="bg-slate-100/50 dark:bg-white/5 rounded-xl p-3 border border-slate-200/30 dark:border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-slate-700 dark:text-slate-300">
                                    Caption Size
                                </span>
                                <span className="text-xs text-slate-500">
                                    {
                                        [
                                            'Small',
                                            'Medium',
                                            'Large',
                                            'Extra Large',
                                            '2XL',
                                            '3XL',
                                            '4XL',
                                        ][captionSize]
                                    }
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-slate-500">A</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="6"
                                    step="1"
                                    value={captionSize}
                                    onChange={handleCaptionSizeChange}
                                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-[#00a8a8]"
                                />
                                <span className="text-lg font-medium leading-none text-slate-500">
                                    A
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50/50 dark:bg-white/5 border-t border-slate-200/20 dark:border-white/5">
                    <button
                        className="w-full py-3 bg-[#00a8a8] hover:bg-[#008f8f] text-white rounded-xl font-medium transition-all transform active:scale-[0.98] border-0"
                        onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
                    >
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
}
