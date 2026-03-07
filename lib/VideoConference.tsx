import type {
    MessageDecoder,
    MessageEncoder,
    TrackReferenceOrPlaceholder,
    WidgetState,
} from '@livekit/components-core';
import { isEqualTrackRef, isTrackReference, isWeb, log } from '@livekit/components-core';
import { RoomEvent, Track } from 'livekit-client';
import * as React from 'react';
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
} from '@livekit/components-react';
import { Lock } from 'lucide-react';
import { ControlBar } from './ControlBar';
import { ParticipantTile } from './ParticipantTile';
import { ParticipantsSidebar } from './ParticipantsSidebar';

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

    console.log(transcriptions);

    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        {
            updateOnlyOn: [
                RoomEvent.ActiveSpeakersChanged,
                RoomEvent.ParticipantMetadataChanged,
                RoomEvent.ParticipantPermissionsChanged,
            ],
            onlySubscribed: false,
        },
    ).filter((track) => {
        try {
            const md = track.participant.metadata ? JSON.parse(track.participant.metadata) : {};
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
    ]);

    const room = useMaybeRoomContext();

    return (
        <div className="lk-video-conference" {...props}>
            {isWeb() && (
                <LayoutContextProvider
                    value={layoutContext}
                    // onPinChange={handleFocusStateChange}
                    onWidgetChange={widgetUpdate}
                >
                    <div className="lk-video-conference-inner">
                        {!focusTrack ? (
                            <div className="lk-grid-layout-wrapper">
                                <GridLayout tracks={tracks}>
                                    <ParticipantTile />
                                </GridLayout>
                            </div>
                        ) : (
                            <div className="lk-focus-layout-wrapper">
                                <FocusLayoutContainer>
                                    <CarouselLayout tracks={carouselTracks}>
                                        <ParticipantTile />
                                    </CarouselLayout>
                                    {focusTrack && <FocusLayout trackRef={focusTrack} />}
                                </FocusLayoutContainer>
                            </div>
                        )}
                        {showTranscription && transcriptions.length > 0 && (
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
                            }}
                            showTranscription={showTranscription}
                            onTranscriptionToggle={setShowTranscription}
                            showParticipants={showParticipants}
                            onParticipantsToggle={handleParticipantsToggle}
                            variation="minimal"
                            className="justify-between!"
                        />
                    </div>
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
                </LayoutContextProvider>
            )}
            <RoomAudioRenderer />
            <ConnectionStateToast />
        </div>
    );
}
