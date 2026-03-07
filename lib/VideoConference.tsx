import type {
    MessageDecoder,
    MessageEncoder,
    TrackReferenceOrPlaceholder,
    WidgetState,
} from '@livekit/components-core';
import { isEqualTrackRef, isTrackReference, isWeb, log } from '@livekit/components-core';
import { RoomEvent, Track } from 'livekit-client';
import * as React from 'react';
import toast from 'react-hot-toast';
import { playSound, SOUNDS, playMessageSound } from './sound';
import type { MessageFormatter } from '@livekit/components-react';
import {
    CarouselLayout,
    Chat,
    ConnectionStateToast,
    FocusLayout,
    FocusLayoutContainer,
    GridLayout,
    LayoutContextProvider,
    RoomAudioRenderer,
    useCreateLayoutContext,
    usePinnedTracks,
    useTracks,
    useTranscriptions,
    useMaybeRoomContext,
    useMaybeLayoutContext,
    useChat,
    useLocalParticipant,
    VideoTrack,
} from '@livekit/components-react';
import { Lock, Mic, MicOff, Video, VideoOff, PictureInPicture } from 'lucide-react';
import { ControlBar } from './ControlBar';
import { ParticipantTile } from './ParticipantTile';
import { ParticipantsSidebar } from './ParticipantsSidebar';
import { PipWindow } from './PipWindow';

/**
 * @public
 */
export interface VideoConferenceProps extends React.HTMLAttributes<HTMLDivElement> {
    chatMessageFormatter?: MessageFormatter;
    chatMessageEncoder?: MessageEncoder;
    chatMessageDecoder?: MessageDecoder;
    /** @alpha */
    SettingsComponent?: React.ComponentType;
}

/**
 * The `VideoConference` ready-made component is your drop-in solution for a classic video conferencing application.
 * It provides functionality such as focusing on one participant, grid view with pagination to handle large numbers
 * of participants, basic non-persistent chat, screen sharing, and more.
 *
 * @remarks
 * The component is implemented with other LiveKit components like `FocusContextProvider`,
 * `GridLayout`, `ControlBar`, `FocusLayoutContainer` and `FocusLayout`.
 * You can use these components as a starting point for your own custom video conferencing application.
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <VideoConference />
 * <LiveKitRoom>
 * ```
 * @public
 */

/** @internal */
function MeetingUI({
    tracks,
    focusTrack,
    carouselTracks,
    showTranscription,
    transcriptions,
    showParticipants,
    handleParticipantsToggle,
    setShowTranscription,
    isPipOpen,
    setIsPipOpen,
    SettingsComponent,
    chatMessageFormatter,
    chatMessageEncoder,
    chatMessageDecoder,
    pipMode = false,
    widgetState,
    setShowParticipants,
    onPipToggle,
    setIsWaitingForShare,
}: {
    tracks: any[];
    focusTrack: any;
    carouselTracks: any[];
    showTranscription: boolean;
    transcriptions: any[];
    showParticipants: boolean;
    handleParticipantsToggle: (show: boolean) => void;
    setShowTranscription: (show: boolean) => void;
    isPipOpen: boolean;
    setIsPipOpen: (open: boolean) => void;
    SettingsComponent?: React.ComponentType;
    chatMessageFormatter?: MessageFormatter;
    chatMessageEncoder?: MessageEncoder;
    chatMessageDecoder?: MessageDecoder;
    pipMode?: boolean;
    widgetState: WidgetState;
    setShowParticipants: (show: boolean) => void;
    onPipToggle?: () => void;
    setIsWaitingForShare?: (waiting: boolean) => void;
}) {
    return (
        <div className="lk-video-conference-inner flex-1 flex flex-row min-h-0 relative w-full h-full overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 relative h-full">
                {!focusTrack ? (
                    <div className="lk-grid-layout-wrapper flex-1">
                        {pipMode &&
                        tracks.filter((t) => t.source === Track.Source.ScreenShare).length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full w-full bg-black text-white p-6 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30 border-b-white mb-4"></div>
                                <h3 className="text-lg font-medium mb-1">Starting sharing...</h3>
                                <p className="text-sm text-white/40">
                                    Select a window or screen to begin.
                                </p>
                            </div>
                        ) : (
                            <GridLayout tracks={tracks}>
                                <ParticipantTile />
                            </GridLayout>
                        )}
                    </div>
                ) : (
                    <div className="lk-focus-layout-wrapper flex-1">
                        {pipMode &&
                        tracks.filter((t) => t.source === Track.Source.ScreenShare).length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full w-full bg-black text-white p-6 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30 border-b-white mb-4"></div>
                                <h3 className="text-lg font-medium mb-1">Starting sharing...</h3>
                                <p className="text-sm text-white/40">
                                    Select a window or screen to begin.
                                </p>
                            </div>
                        ) : (
                            <FocusLayoutContainer>
                                <CarouselLayout tracks={carouselTracks}>
                                    <ParticipantTile />
                                </CarouselLayout>
                                {focusTrack && <FocusLayout trackRef={focusTrack} />}
                            </FocusLayoutContainer>
                        )}
                    </div>
                )}
                {showTranscription && transcriptions.length > 0 && !pipMode && (
                    <div className="absolute bottom-[80px] left-0 right-0 flex justify-center pointer-events-none mb-2 z-10">
                        <div className="bg-black/70 backdrop-blur-md rounded-lg p-3 max-w-2xl w-full max-h-48 overflow-y-auto lk-transcription-container pointer-events-auto shadow-lg">
                            {transcriptions.map((t) => (
                                <div
                                    key={t.streamInfo?.id || Math.random().toString()}
                                    className="text-white text-sm mb-1 last:mb-0"
                                >
                                    <span className="font-semibold text-gray-300 mr-2">
                                        {t.participantInfo?.identity || 'System'}:
                                    </span>
                                    <span className="opacity-100">{t.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <ControlBar
                    controls={{
                        invite: true,
                        chat: true,
                        settings: !!SettingsComponent,
                        agent: true,
                        transcription: false,
                        participants: true,
                        hand: true,
                        pip: false,
                    }}
                    showTranscription={showTranscription}
                    onTranscriptionToggle={setShowTranscription}
                    showParticipants={showParticipants}
                    onParticipantsToggle={handleParticipantsToggle}
                    onPipToggle={onPipToggle}
                    onDeviceError={(error) => {
                        if (error.source === Track.Source.ScreenShare) {
                            console.log('Screen share device error:', error);
                            setIsPipOpen(false);
                            setIsWaitingForShare?.(false);
                            if (error.error.name === 'NotAllowedError') {
                                toast.error('Screen sharing was cancelled or denied');
                            }
                        }
                    }}
                    variation="minimal"
                    className="justify-between!"
                    pipMode={pipMode}
                />
            </div>

            {!pipMode && (
                <>
                    <Chat
                        style={{ display: widgetState.showChat ? 'grid' : 'none' }}
                        messageFormatter={chatMessageFormatter}
                        messageEncoder={chatMessageEncoder}
                        messageDecoder={chatMessageDecoder}
                    />
                    <ParticipantsSidebar
                        style={{ display: showParticipants ? 'flex' : 'none' }}
                        onClose={() => setShowParticipants(false)}
                    />
                    {SettingsComponent && (
                        <div
                            className="lk-settings-menu-modal"
                            style={{ display: widgetState.showSettings ? 'block' : 'none' }}
                        >
                            <SettingsComponent />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function VideoConference({
    chatMessageFormatter,
    chatMessageDecoder,
    chatMessageEncoder,
    SettingsComponent,
    ...props
}: VideoConferenceProps) {
    const [widgetState, setWidgetState] = React.useState<WidgetState>({
        showChat: false,
        unreadMessages: 0,
        showSettings: false,
    });
    const [showTranscription, setShowTranscription] = React.useState(false);
    const [showParticipants, setShowParticipants] = React.useState(false);
    const transcriptions = useTranscriptions();
    const lastAutoFocusedScreenShareTrack = React.useRef<TrackReferenceOrPlaceholder | null>(null);

    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        {
            onlySubscribed: false,
        },
    ).filter((track) => {
        try {
            const md = (track.participant as any).metadata
                ? JSON.parse((track.participant as any).metadata)
                : {};
            return md.status !== 'waiting';
        } catch (e) {
            return true;
        }
    });

    const widgetUpdate = (state: WidgetState) => {
        log.debug('updating widget state', state);
        setWidgetState(state);
    };

    const layoutContext = useCreateLayoutContext();

    const handleParticipantsToggle = React.useCallback(
        (show: boolean) => {
            if (show && widgetState.showChat) {
                layoutContext.widget.dispatch?.({ msg: 'toggle_chat' });
            }
            setShowParticipants(show);
        },
        [widgetState.showChat, layoutContext],
    );

    React.useEffect(() => {
        if (widgetState.showChat && showParticipants) {
            setShowParticipants(false);
        }
    }, [widgetState.showChat, showParticipants]);

    const screenShareTracks = tracks
        .filter(isTrackReference)
        .filter((track) => track.publication.source === Track.Source.ScreenShare);

    const focusTrack = usePinnedTracks(layoutContext)?.[0];
    const carouselTracks = tracks.filter((track) => !isEqualTrackRef(track, focusTrack));

    React.useEffect(() => {
        // If screen share tracks are published, and no pin is set explicitly, auto set the screen share.
        if (
            screenShareTracks.some((track) => track.publication.isSubscribed) &&
            lastAutoFocusedScreenShareTrack.current === null
        ) {
            log.debug('Auto set screen share focus:', {
                newScreenShareTrack: screenShareTracks[0],
            });
            layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: screenShareTracks[0] });
            lastAutoFocusedScreenShareTrack.current = screenShareTracks[0];
        } else if (
            lastAutoFocusedScreenShareTrack.current &&
            !screenShareTracks.some(
                (track) =>
                    track.publication.trackSid ===
                    lastAutoFocusedScreenShareTrack.current?.publication?.trackSid,
            )
        ) {
            log.debug('Auto clearing screen share focus.');
            layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
            lastAutoFocusedScreenShareTrack.current = null;
        }
        if (focusTrack && !isTrackReference(focusTrack)) {
            const updatedFocusTrack = tracks.find(
                (tr) =>
                    tr.participant.identity === focusTrack.participant.identity &&
                    tr.source === focusTrack.source,
            );
            if (updatedFocusTrack !== focusTrack && isTrackReference(updatedFocusTrack)) {
                layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: updatedFocusTrack });
            }
        }
    }, [
        screenShareTracks
            .map((ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`)
            .join(),
        focusTrack?.publication?.trackSid,
        tracks,
        layoutContext.pin,
    ]);

    const lastGlobalPinnedId = React.useRef<string | null>(null);

    // Handle global "Pin for everyone" via participant attributes
    React.useEffect(() => {
        const pinnedParticipant = tracks.find((t) => t.participant.attributes.pinned === 'true');

        if (pinnedParticipant) {
            const isAlreadyPinned = layoutContext.pin.state?.some((p) =>
                isEqualTrackRef(p, pinnedParticipant),
            );
            if (!isAlreadyPinned) {
                log.debug('Setting global pin:', pinnedParticipant.participant.identity);
                layoutContext.pin.dispatch?.({
                    msg: 'set_pin',
                    trackReference: pinnedParticipant,
                });
                lastGlobalPinnedId.current = pinnedParticipant.participant.identity;
            }
        } else if (lastGlobalPinnedId.current) {
            // The global pin was removed. Clear it for everyone.
            log.debug('Clearing global pin:', lastGlobalPinnedId.current);
            layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
            lastGlobalPinnedId.current = null;
        }
    }, [tracks, layoutContext, focusTrack, screenShareTracks.length]);

    const room = useMaybeRoomContext();
    const { isScreenShareEnabled, localParticipant } = useLocalParticipant();

    const { chatMessages } = useChat();
    const [pipWindow, setPipWindow] = React.useState<Window | null>(null);
    const [isWaitingForShare, setIsWaitingForShare] = React.useState(false);

    const togglePip = React.useCallback(async () => {
        if (pipWindow) {
            pipWindow.close();
            setPipWindow(null);
            setIsWaitingForShare(false);
        } else {
            if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
                try {
                    // If not already sharing, we are waiting for the picker to finish
                    if (!isScreenShareEnabled) {
                        setIsWaitingForShare(true);
                    }
                    // @ts-ignore
                    const win = await window.documentPictureInPicture.requestWindow({
                        width: 320,
                        height: 540,
                    });
                    setPipWindow(win);
                } catch (e) {
                    console.error('Failed to open PiP window:', e);
                    setIsWaitingForShare(false);
                }
            }
        }
    }, [pipWindow, isScreenShareEnabled]);

    const lastMessageId = React.useRef<string | null>(null);

    // Play sound for new remote chat messages
    React.useEffect(() => {
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (!lastMsg) return;

        if (
            lastMsg.id !== lastMessageId.current &&
            lastMsg.from?.identity !== localParticipant.identity
        ) {
            lastMessageId.current = lastMsg.id;
            playMessageSound();
        }
    }, [chatMessages, localParticipant.identity]);

    // Automatic Picture-in-Picture closure based on reactive screen share state
    React.useEffect(() => {
        if (isScreenShareEnabled) {
            // Sharing has successfully started, clear the "waiting" block
            setIsWaitingForShare(false);
        } else if (!isWaitingForShare && pipWindow) {
            // Sharing stopped AND we aren't currently waiting for a new selection
            pipWindow.close();
            setPipWindow(null);
        }
    }, [isScreenShareEnabled, isWaitingForShare, pipWindow]);

    // Track visibility to close PiP on return (if not explicitly triggered)
    React.useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && pipWindow) {
                // Explicitly close the PiP window
                pipWindow.close();
                setPipWindow(null);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [pipWindow]);

    // Handle "Request Unmute" from admin
    React.useEffect(() => {
        if (!room) return;

        const handleDataReceived = (payload: Uint8Array) => {
            try {
                const decoder = new TextDecoder();
                const data = JSON.parse(decoder.decode(payload));

                if (data.type === 'request-unmute') {
                    playSound(SOUNDS.UNMUTE_REQUEST);
                    toast(
                        (t) => (
                            <div className="flex flex-col gap-3 p-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-[#00a8a8] animate-pulse" />
                                    <p className="font-semibold text-sm">Unmute Request</p>
                                </div>
                                <p className="text-xs text-slate-400">
                                    The host has requested you to unmute your microphone.
                                </p>
                                <button
                                    onClick={async () => {
                                        toast.dismiss(t.id);
                                        await room.localParticipant.setMicrophoneEnabled(true);
                                    }}
                                    className="w-full bg-[#00a8a8] hover:bg-[#00a8a8]/90 text-white py-2 rounded-lg text-xs font-bold transition-colors border-0"
                                >
                                    Unmute Now
                                </button>
                            </div>
                        ),
                        {
                            duration: 10000,
                            position: 'bottom-center',
                            style: {
                                background: '#1e293b',
                                color: '#f8fafc',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                padding: '12px',
                                minWidth: '260px',
                            },
                        },
                    );
                }
            } catch (e) {
                // Ignore non-JSON or other messages
            }
        };

        room.on(RoomEvent.DataReceived, handleDataReceived);
        return () => {
            room.off(RoomEvent.DataReceived, handleDataReceived);
        };
    }, [room]);

    return (
        <div className="lk-video-conference" {...props}>
            {isWeb() && (
                <LayoutContextProvider value={layoutContext} onWidgetChange={widgetUpdate}>
                    <div
                        className={`lk-video-conference-inner-wrapper h-full w-full relative ${
                            pipWindow ? 'hidden' : 'flex flex-col'
                        }`}
                    >
                        <MeetingUI
                            tracks={tracks}
                            focusTrack={focusTrack}
                            carouselTracks={carouselTracks}
                            showTranscription={showTranscription}
                            transcriptions={transcriptions}
                            showParticipants={showParticipants}
                            handleParticipantsToggle={handleParticipantsToggle}
                            setShowTranscription={setShowTranscription}
                            isPipOpen={!!pipWindow}
                            setIsPipOpen={(open) => {
                                if (!open && pipWindow) {
                                    pipWindow.close();
                                    setPipWindow(null);
                                }
                            }}
                            SettingsComponent={SettingsComponent}
                            chatMessageFormatter={chatMessageFormatter}
                            chatMessageEncoder={chatMessageEncoder}
                            chatMessageDecoder={chatMessageDecoder}
                            widgetState={widgetState}
                            setShowParticipants={setShowParticipants}
                            onPipToggle={togglePip}
                            setIsWaitingForShare={setIsWaitingForShare}
                        />
                    </div>

                    {pipWindow && (
                        <>
                            <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
                                <span className="text-white/40 text-sm font-medium animate-pulse flex items-center gap-2">
                                    <PictureInPicture size={16} />
                                    Mini Player Active
                                </span>
                            </div>
                            <PipWindow pipWindow={pipWindow} onClose={() => setPipWindow(null)}>
                                <MeetingUI
                                    tracks={tracks}
                                    focusTrack={focusTrack}
                                    carouselTracks={carouselTracks}
                                    showTranscription={showTranscription}
                                    transcriptions={transcriptions}
                                    showParticipants={showParticipants}
                                    handleParticipantsToggle={handleParticipantsToggle}
                                    setShowTranscription={setShowTranscription}
                                    isPipOpen={true}
                                    setIsPipOpen={(open) => {
                                        if (!open) {
                                            pipWindow.close();
                                            setPipWindow(null);
                                        }
                                    }}
                                    SettingsComponent={SettingsComponent}
                                    chatMessageFormatter={chatMessageFormatter}
                                    chatMessageEncoder={chatMessageEncoder}
                                    chatMessageDecoder={chatMessageDecoder}
                                    pipMode={true}
                                    widgetState={widgetState}
                                    setShowParticipants={setShowParticipants}
                                    onPipToggle={togglePip}
                                    setIsWaitingForShare={setIsWaitingForShare}
                                />
                            </PipWindow>
                        </>
                    )}
                </LayoutContextProvider>
            )}
            <RoomAudioRenderer />
            <ConnectionStateToast />
        </div>
    );
}
