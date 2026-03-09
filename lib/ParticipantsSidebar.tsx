import * as React from 'react';
import {
    useParticipants,
    useLocalParticipant,
    useMaybeRoomContext,
} from '@livekit/components-react';
import { X, MoreVertical, UserPlus, Pin, PinOff, MicOff, Mic, UserX } from 'lucide-react';
import { Participant, RoomEvent } from 'livekit-client';
import toast from 'react-hot-toast';
import { InviteModal } from './InviteModal';
import { useAuth } from '@/components/AuthProvider';
import { playSound, SOUNDS } from './sound';

export interface ParticipantsSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    onClose: () => void;
}

export function ParticipantsSidebar({
    onClose,
    style,
    className,
    ...props
}: ParticipantsSidebarProps) {
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();
    const room = useMaybeRoomContext();
    const [isProcessing, setIsProcessing] = React.useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false);
    const [openMenu, setOpenMenu] = React.useState<string | null>(null);
    const { user } = useAuth();

    const localMetadata = React.useMemo(() => {
        if (!localParticipant?.metadata) return {};
        try {
            return JSON.parse(localParticipant.metadata);
        } catch {
            return {};
        }
    }, [localParticipant?.metadata]);

    const isAdmin = (localParticipant?.permissions as any)?.roomAdmin || localMetadata?.isCreator;

    const inCallParticipants = React.useMemo(() => {
        return participants.filter((p) => {
            if (p.permissions?.canPublish) return true;
            try {
                const md = p.metadata ? JSON.parse(p.metadata) : {};
                return md.status !== 'waiting';
            } catch {
                return true;
            }
        });
    }, [participants]);

    const waitingParticipants = React.useMemo(() => {
        return participants.filter((p) => {
            if (p.permissions?.canPublish) return false;
            try {
                const md = p.metadata ? JSON.parse(p.metadata) : {};
                return md.status === 'waiting';
            } catch {
                return false;
            }
        });
    }, [participants]);

    const handleAction = async (identity: string, action: string) => {
        if (!room) return;
        setIsProcessing(identity);
        setOpenMenu(null);
        try {
            const res = await fetch('/api/room-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName: room.name,
                    identity,
                    action,
                }),
            });
            if (!res.ok) throw new Error('Failed to perform action');

            const actionText =
                action === 'mute'
                    ? 'Muted for everyone'
                    : action === 'unmute'
                      ? 'Unmute requested'
                      : action === 'togglePin'
                        ? 'Pin toggled'
                        : action === 'remove'
                          ? 'Participant removed'
                          : 'Action performed';

            toast.success(actionText);
        } catch (error) {
            console.error(error);
            toast.error('Could not process request');
        } finally {
            setIsProcessing(null);
        }
    };

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => setOpenMenu(null);
        if (openMenu) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [openMenu]);

    const notifiedParticipants = React.useRef<Set<string>>(new Set());
    const activeToasts = React.useRef<Record<string, string>>({});

    // Track real-time new joiners for toast notifications
    React.useEffect(() => {
        if (!room) return;

        const showJoinToast = (participant: Participant) => {
            if (notifiedParticipants.current.has(participant.identity)) return;
            notifiedParticipants.current.add(participant.identity);

            playSound(SOUNDS.JOIN_REQUEST);

            const toastId = toast.custom(
                (t) => (
                    <div className="max-w-md w-full mb-[64px]! bg-white dark:bg-[#1e2936] shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 pointer-events-auto flex ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-bottom-5 duration-300">
                        <div className="flex-1 w-0 p-4">
                            <div className="flex items-start">
                                <div className="shrink-0 pt-0.5">
                                    <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                        <UserPlus size={20} />
                                    </div>
                                </div>
                                <div className="ml-3 flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white m-0">
                                        {participant.name || participant.identity}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-0">
                                        is waiting to join
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex border-l border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => {
                                    toast.dismiss(t.id);
                                    handleAction(participant.identity, 'admit');
                                }}
                                className="w-full border-0 rounded-full bg-transparent px-4 py-3 flex items-center justify-center text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-600 focus:outline-none"
                            >
                                Admit
                            </button>
                            <button
                                onClick={() => {
                                    toast.dismiss(t.id);
                                    handleAction(participant.identity, 'deny');
                                }}
                                className="w-full border-0 rounded-full bg-transparent px-4 py-3 flex items-center justify-center text-sm font-medium text-red-700 dark:text-slate-300 hover:text-slate-500 dark:hover:text-slate-600 focus:outline-none"
                            >
                                Deny
                            </button>
                        </div>
                    </div>
                ),
                { duration: Infinity, position: 'bottom-left' },
            );
            activeToasts.current[participant.identity] = toastId;
        };

        const checkParticipant = (participant: Participant) => {
            if (participant === room.localParticipant) return;

            // Log full state for debugging missing toasts
            const localPermissions = room.localParticipant.permissions as any;
            const localMD = room.localParticipant.metadata
                ? JSON.parse(room.localParticipant.metadata)
                : {};

            // Check if local user is admin OR the creator (fallback if permissions aren't synced yet)
            const isAdmin = localPermissions?.roomAdmin || localMD?.isCreator;
            if (!isAdmin) return;

            try {
                const md = participant.metadata ? JSON.parse(participant.metadata) : {};
                if (md.status === 'waiting' && !participant.permissions?.canPublish) {
                    console.log('Triggering toast for:', participant.identity);
                    showJoinToast(participant);
                } else if (md.status !== 'waiting' || participant.permissions?.canPublish) {
                    // Remove from notified if they are no longer waiting (e.g. admitted)
                    // so if they leave and rejoin we can notify again
                    notifiedParticipants.current.delete(participant.identity);
                    if (activeToasts.current[participant.identity]) {
                        toast.dismiss(activeToasts.current[participant.identity]);
                        delete activeToasts.current[participant.identity];
                    }
                }
            } catch (e) {}
        };

        // Check already connected participants
        const checkExisting = () => {
            room.remoteParticipants.forEach((p) => checkParticipant(p));
        };

        const handleParticipantConnected = (participant: Participant) => {
            // Give a moment for metadata/permissions to sync
            setTimeout(() => checkParticipant(participant), 1000);
        };

        const handleMetadataChanged = (prev: string | undefined, participant: Participant) => {
            checkParticipant(participant);
        };

        const handlePermissionsChanged = (prev: any, participant: Participant) => {
            if (participant === room.localParticipant) {
                // If local permissions changed, re-check everyone
                checkExisting();
            } else {
                checkParticipant(participant);
            }
        };

        const handleParticipantDisconnected = (participant: Participant) => {
            if (activeToasts.current[participant.identity]) {
                toast.dismiss(activeToasts.current[participant.identity]);
                delete activeToasts.current[participant.identity];
            }
            notifiedParticipants.current.delete(participant.identity);
        };

        room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
        room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
        room.on(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
        room.on(RoomEvent.ParticipantPermissionsChanged, handlePermissionsChanged);
        room.on(RoomEvent.Connected, checkExisting);

        // Initial check
        checkExisting();

        return () => {
            room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
            room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
            room.off(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
            room.off(RoomEvent.ParticipantPermissionsChanged, handlePermissionsChanged);
            room.off(RoomEvent.Connected, checkExisting);

            // Dismiss all active toasts on unmount
            Object.values(activeToasts.current).forEach((toastId) => {
                toast.dismiss(toastId);
            });
            activeToasts.current = {};
        };
    }, [room]);

    return (
        <aside
            className={`w-80 border-l bg-(--lk-bg) border-white/10 flex flex-col h-full z-20 shadow-xl ${className || ''}`}
            style={style}
            {...props}
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-white text-lg font-bold">People</h2>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white transition-colors bg-transparent border-0"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                <div className="px-5 py-4 flex flex-col gap-6">
                    {/* Waiting Participants */}
                    {waitingParticipants.length > 0 && isAdmin && (
                        <div>
                            <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-4 flex justify-between items-center">
                                <span>Waiting to join ({waitingParticipants.length})</span>
                            </h3>

                            <div className="space-y-4">
                                {waitingParticipants.map((participant: Participant) => {
                                    const remoteName = participant.name || participant.identity;
                                    const initials = (remoteName || '?').charAt(0).toUpperCase();

                                    const metadataStr = participant.metadata;
                                    let metadata: any = null;
                                    if (metadataStr) {
                                        try {
                                            metadata = JSON.parse(metadataStr);
                                        } catch (e) {
                                            // ignore
                                        }
                                    }

                                    return (
                                        <div
                                            key={participant.identity}
                                            className="flex flex-col gap-2"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="size-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-white font-semibold bg-cover bg-center overflow-hidden"
                                                    style={
                                                        metadata?.avatarThumbUrl ||
                                                        metadata?.avatarUrl
                                                            ? {
                                                                  backgroundImage: `url(${metadata.avatarThumbUrl || metadata.avatarUrl})`,
                                                              }
                                                            : {}
                                                    }
                                                >
                                                    {!(
                                                        metadata?.avatarThumbUrl ||
                                                        metadata?.avatarUrl
                                                    ) && initials}
                                                </div>
                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                    <p className="text-sm font-semibold text-white truncate">
                                                        {remoteName}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    onClick={() =>
                                                        handleAction(participant.identity, 'deny')
                                                    }
                                                    disabled={isProcessing === participant.identity}
                                                    className="flex-1 py-1.5 px-3 rounded-md text-sm font-medium bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                >
                                                    Deny
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleAction(participant.identity, 'admit')
                                                    }
                                                    disabled={isProcessing === participant.identity}
                                                    className="flex-1 py-1.5 px-3 rounded-md text-sm font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                                >
                                                    Admit
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Active Participants */}
                    <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex justify-between items-center">
                            <span>In call ({inCallParticipants.length})</span>
                        </h3>

                        <div className="space-y-4">
                            {inCallParticipants.map((participant: Participant) => {
                                const isLocal = localParticipant.identity === participant.identity;
                                const remoteName = participant.name || participant.identity;
                                const displayName = isLocal ? `${remoteName} (You)` : remoteName;
                                const initials = (remoteName || '?').charAt(0).toUpperCase();

                                const isHandRaised = participant.attributes?.handRaised === 'true';

                                const metadataStr = participant.metadata;
                                let metadata: any = null;
                                if (metadataStr) {
                                    try {
                                        metadata = JSON.parse(metadataStr);
                                    } catch (e) {
                                        // ignore
                                    }
                                }

                                return (
                                    <div
                                        key={participant.identity}
                                        className="flex items-center gap-3"
                                    >
                                        <div
                                            className="size-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-white font-semibold bg-cover bg-center overflow-hidden"
                                            style={
                                                metadata?.avatarThumbUrl || metadata?.avatarUrl
                                                    ? {
                                                          backgroundImage: `url(${metadata.avatarThumbUrl || metadata.avatarUrl})`,
                                                      }
                                                    : {}
                                            }
                                        >
                                            {!(metadata?.avatarThumbUrl || metadata?.avatarUrl) &&
                                                initials}
                                        </div>
                                        <div className="flex-1 min-w-0 flex items-center gap-2">
                                            <p className="text-sm font-semibold text-white truncate">
                                                {displayName}
                                            </p>
                                            {isHandRaised && (
                                                <span
                                                    className="material-symbols-outlined text-[16px] animate-wave"
                                                    style={{
                                                        fontVariationSettings: '"FILL" 1',
                                                        color: '#ffd500',
                                                    }}
                                                    title="Hand Raised"
                                                >
                                                    back_hand
                                                </span>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <button
                                                className={`text-slate-400 hover:text-white transition-colors border-0 bg-transparent p-1 rounded-md ${openMenu === participant.identity ? 'text-white bg-white/10' : ''}`}
                                                title="More options"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenu(
                                                        openMenu === participant.identity
                                                            ? null
                                                            : participant.identity,
                                                    );
                                                }}
                                            >
                                                <MoreVertical size={18} />
                                            </button>

                                            {openMenu === participant.identity && (
                                                <div
                                                    className="absolute right-0 mt-2 w-48 bg-slate-800 border border-white/10 rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        onClick={() =>
                                                            handleAction(
                                                                participant.identity,
                                                                'togglePin',
                                                            )
                                                        }
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 transition-colors border-0 bg-transparent text-left"
                                                    >
                                                        {participant.attributes?.pinned ===
                                                        'true' ? (
                                                            <PinOff size={16} />
                                                        ) : (
                                                            <Pin size={16} />
                                                        )}
                                                        {participant.attributes?.pinned === 'true'
                                                            ? 'Unpin for everyone'
                                                            : 'Pin for everyone'}
                                                    </button>
                                                    {isAdmin && !isLocal && (
                                                        <button
                                                            onClick={() =>
                                                                handleAction(
                                                                    participant.identity,
                                                                    participant.isMicrophoneEnabled
                                                                        ? 'mute'
                                                                        : 'unmute',
                                                                )
                                                            }
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 transition-colors border-0 bg-transparent text-left"
                                                        >
                                                            {participant.isMicrophoneEnabled ? (
                                                                <MicOff size={16} />
                                                            ) : (
                                                                <Mic size={16} />
                                                            )}
                                                            {participant.isMicrophoneEnabled
                                                                ? 'Mute for everyone'
                                                                : 'Request unmute'}
                                                        </button>
                                                    )}
                                                    {((isAdmin && !isLocal) ||
                                                        (localParticipant?.permissions as any)
                                                            ?.canManageAgentSession) && (
                                                        <>
                                                            <hr className="my-1 border-white/10" />
                                                            <button
                                                                onClick={() =>
                                                                    handleAction(
                                                                        participant.identity,
                                                                        'remove',
                                                                    )
                                                                }
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors border-0 bg-transparent text-left"
                                                            >
                                                                <UserX size={16} />
                                                                Remove participant
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3.5 border-t border-white/10">
                <button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="w-full py-2.5 px-4 border-0 bg-slate-700/50 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <UserPlus size={18} />
                    Add people
                </button>
            </div>
            {room && (
                <InviteModal
                    isOpen={isInviteModalOpen}
                    onClose={() => setIsInviteModalOpen(false)}
                    roomName={room.name}
                />
            )}
        </aside>
    );
}
