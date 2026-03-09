'use client';
import * as React from 'react';
import { useMaybeRoomContext, useMediaDeviceSelect } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { Check, Volume2, ChevronDown } from 'lucide-react';

export function SpeakerSettings({
    settingsRef,
}: {
    settingsRef: React.RefObject<HTMLDivElement | null>;
}) {
    const room = useMaybeRoomContext();
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleError = React.useCallback(
        (e: Error) => {
            if (room) {
                room.emit(RoomEvent.MediaDevicesError, e);
            }
        },
        [room],
    );

    const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
        kind: 'audiooutput',
        room,
        requestPermissions: true,
        onError: handleError,
    });

    const activeDevice = React.useMemo(
        () => devices.find((d) => d.deviceId === activeDeviceId),
        [devices, activeDeviceId],
    );

    const handleDeviceChange = async (deviceId: string) => {
        try {
            await setActiveMediaDevice(deviceId, { exact: true });
            setIsOpen(false);
        } catch (e) {
            console.error('Failed to set audio output device:', e);
        }
    };

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // Scroll top container to bottom so the dropdown is fully visible
            if (settingsRef.current) {
                settingsRef.current.scrollTo({
                    top: settingsRef.current.scrollHeight,
                    behavior: 'smooth',
                });
            }
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, settingsRef]);

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 rounded-xl text-sm transition-all border border-slate-200/50 dark:border-white/10 bg-slate-100/50 dark:bg-white/5 hover:bg-slate-200/50 dark:hover:bg-white/10 cursor-pointer text-slate-700 dark:text-slate-200 group"
            >
                <div className="flex items-center gap-2 truncate">
                    <Volume2 className="w-4 h-4 shrink-0 text-[#00a8a8]" />
                    <span className="truncate">{activeDevice?.label || 'Select Speaker'}</span>
                </div>
                <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-(--lk-bg)/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200/50 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <ul className="m-0 p-1 list-none flex flex-col max-h-60 overflow-y-auto scrollbar-hide">
                        {devices.map((device) => {
                            const isActive = device.deviceId === activeDeviceId;
                            return (
                                <li key={device.deviceId}>
                                    <button
                                        onClick={() => handleDeviceChange(device.deviceId)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-all border-0 bg-transparent cursor-pointer ${
                                            isActive
                                                ? 'bg-[#00a8a8]/10 text-[#00a8a8] font-medium'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <span className="truncate pr-4">
                                            {device.label ||
                                                `Speaker ${device.deviceId.slice(0, 5)}...`}
                                        </span>
                                        {isActive && (
                                            <Check className="w-4 h-4 shrink-0 text-[#00a8a8]" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                        {devices.length === 0 && (
                            <li className="text-center py-4 text-slate-400 text-sm italic">
                                No audio output devices found
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
