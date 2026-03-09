import { Track, ParticipantKind } from 'livekit-client';
import * as React from 'react';
import { MediaDeviceMenu } from '@livekit/components-react';
import { DisconnectButton } from '@livekit/components-react';
import { TrackToggle } from '@livekit/components-react';
import { ChatToggle } from '@livekit/components-react';
import {
    useLocalParticipantPermissions,
    usePersistentUserChoices,
    useMaybeLayoutContext,
    useMaybeRoomContext,
    useLocalParticipant,
    useParticipantAttribute,
    useParticipants,
    useIsRecording,
    useRoomContext,
} from '@livekit/components-react';
import { supportsScreenSharing } from '@livekit/components-core';
import { StartMediaButton } from '@livekit/components-react';
import {
    Bot,
    UsersRound,
    Settings as SettingsIcon,
    MonitorUp,
    MessageSquareText,
    Copy,
    PhoneOff,
    Hand,
    PictureInPicture,
    Circle,
    Square,
    Smile,
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmojiPicker, { Theme } from 'emoji-picker-react';

export function useMediaQuery(query: string): boolean {
    const getMatches = (query: string): boolean => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return false;
    };
    const [matches, setMatches] = React.useState<boolean>(getMatches(query));

    React.useEffect(() => {
        const matchMedia = window.matchMedia(query);
        function handleChange() {
            setMatches(getMatches(query));
        }
        handleChange();
        if (matchMedia.addListener) matchMedia.addListener(handleChange);
        else matchMedia.addEventListener('change', handleChange);
        return () => {
            if (matchMedia.removeListener) matchMedia.removeListener(handleChange);
            else matchMedia.removeEventListener('change', handleChange);
        };
    }, [query]);
    return matches;
}

/** @public */
export type ControlBarControls = {
    invite?: boolean;
    microphone?: boolean;
    camera?: boolean;
    chat?: boolean;
    screenShare?: boolean;
    leave?: boolean;
    settings?: boolean;
    agent?: boolean;
    transcription?: boolean;
    participants?: boolean;
    hand?: boolean;
    emoji?: boolean;
    pip?: boolean;
    recording?: boolean;
};

const trackSourceToProtocol = (source: Track.Source) => {
    // NOTE: this mapping avoids importing the protocol package as that leads to a significant bundle size increase
    switch (source) {
        case Track.Source.Camera:
            return 1;
        case Track.Source.Microphone:
            return 2;
        case Track.Source.ScreenShare:
            return 3;
        default:
            return 0;
    }
};

/** @public */
export interface ControlBarProps extends React.HTMLAttributes<HTMLDivElement> {
    onDeviceError?: (error: { source: Track.Source; error: Error }) => void;
    variation?: 'minimal' | 'verbose' | 'textOnly';
    controls?: ControlBarControls;
    /**
     * If `true`, the user's device choices will be persisted.
     * This will enable the user to have the same device choices when they rejoin the room.
     * @defaultValue true
     * @alpha
     */
    saveUserChoices?: boolean;
    showTranscription?: boolean;
    onTranscriptionToggle?: (show: boolean) => void;
    showParticipants?: boolean;
    onParticipantsToggle?: (show: boolean) => void;
    onPipToggle?: () => void;
    pipMode?: boolean;
}

/**
 * The `ControlBar` prefab gives the user the basic user interface to control their
 * media devices (camera, microphone and screen share), open the `Chat` and leave the room.
 *
 * @remarks
 * This component is build with other LiveKit components like `TrackToggle`,
 * `DeviceSelectorButton`, `DisconnectButton` and `StartAudio`.
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <ControlBar />
 * </LiveKitRoom>
 * ```
 * @public
 */
export function ControlBar({
    variation,
    controls,
    saveUserChoices = true,
    showTranscription,
    onTranscriptionToggle,
    showParticipants,
    onParticipantsToggle,
    onPipToggle,
    pipMode,
    onDeviceError,
    ...props
}: ControlBarProps) {
    const [isChatOpen, setIsChatOpen] = React.useState(false);
    const [agentOpen, setAgentOpen] = React.useState(false);
    const [isEmojiMenuOpen, setIsEmojiMenuOpen] = React.useState(false);
    const emojiMenuRef = React.useRef<HTMLDivElement>(null);
    const layoutContext = useMaybeLayoutContext();
    const roomContext = useMaybeRoomContext();
    const room = useRoomContext();
    const participants = useParticipants();

    const waitingCount = React.useMemo(() => {
        return participants.filter((p) => {
            try {
                const md = p.metadata ? JSON.parse(p.metadata) : {};
                return md.status === 'waiting';
            } catch (e) {
                return false;
            }
        }).length;
    }, [participants]);

    const recordingEndpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT;
    const isRecording = useIsRecording();
    const [initialRecStatus, setInitialRecStatus] = React.useState(isRecording);
    const [processingRecRequest, setProcessingRecRequest] = React.useState(false);

    React.useEffect(() => {
        if (initialRecStatus !== isRecording) {
            setProcessingRecRequest(false);
        }
    }, [isRecording, initialRecStatus]);

    const toggleRoomRecording = async () => {
        if (!recordingEndpoint) {
            throw TypeError('No recording endpoint specified');
        }
        if (room.isE2EEEnabled) {
            throw Error('Recording of encrypted meetings is currently not supported');
        }
        setProcessingRecRequest(true);
        setInitialRecStatus(isRecording);
        let response: Response;
        if (isRecording) {
            response = await fetch(recordingEndpoint + `/stop?roomName=${room.name}`);
        } else {
            response = await fetch(recordingEndpoint + `/start?roomName=${room.name}`);
        }
        if (response.ok) {
        } else {
            console.error(
                'Error handling recording request, check server logs:',
                response.status,
                response.statusText,
            );
            setProcessingRecRequest(false);
            toast.error('Recording Feature is not available');
        }
    };

    // Reset agentOpen when the agent participant is removed from the room
    React.useEffect(() => {
        if (!agentOpen) return;

        const hasAgent = participants.some(
            (p) => p.kind === ParticipantKind.AGENT || p.identity.includes('dvai-support'),
        );

        if (!hasAgent) {
            setAgentOpen(false);
        }
    }, [participants, agentOpen]);

    // Manage local hand-raise state via participant attributes
    const { localParticipant } = useLocalParticipant();
    const handRaisedAttr = useParticipantAttribute('handRaised', { participant: localParticipant });
    const isHandRaised = handRaisedAttr === 'true';

    const localMetadata = React.useMemo(() => {
        if (!localParticipant?.metadata) return {};
        try {
            return JSON.parse(localParticipant.metadata);
        } catch {
            return {};
        }
    }, [localParticipant?.metadata]);

    const isAdmin = (localParticipant?.permissions as any)?.roomAdmin || localMetadata?.isCreator;

    React.useEffect(() => {
        if (layoutContext?.widget.state?.showChat !== undefined) {
            setIsChatOpen(layoutContext?.widget.state?.showChat);
        }
    }, [layoutContext?.widget.state?.showChat]);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiMenuRef.current && !emojiMenuRef.current.contains(event.target as Node)) {
                setIsEmojiMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleReaction = React.useCallback(
        async (reaction: any) => {
            if (!localParticipant) return;
            const emoji = reaction.unified.toLowerCase().replace(/-/g, '_');
            await localParticipant.setAttributes({ emoji });

            setTimeout(async () => {
                if (localParticipant.attributes.emoji === emoji) {
                    await localParticipant.setAttributes({ emoji: '' });
                }
            }, 5000);
        },
        [localParticipant],
    );
    const isTooLittleSpace = useMediaQuery(`(max-width: ${isChatOpen ? 1000 : 760}px)`);

    const defaultVariation = isTooLittleSpace ? 'minimal' : 'verbose';
    variation ??= defaultVariation;

    const visibleControls: Required<ControlBarControls> = pipMode
        ? {
              microphone: true,
              camera: true,
              chat: false,
              screenShare: true,
              leave: true,
              agent: false,
              recording: false,
              invite: false,
              settings: false,
              transcription: false,
              participants: false,
              hand: false,
              emoji: false,
              pip: false,
          }
        : {
              invite: true,
              microphone: true,
              camera: true,
              chat: true,
              screenShare: true,
              leave: true,
              settings: true,
              agent: true,
              transcription: true,
              participants: true,
              hand: true,
              emoji: true,
              pip: true,
              recording: true,
              ...controls,
          };

    const localPermissions = useLocalParticipantPermissions();

    if (!localPermissions) {
        visibleControls.camera = false;
        visibleControls.chat = false;
        visibleControls.microphone = false;
        visibleControls.screenShare = false;
    } else {
        const canPublishSource = (source: Track.Source) => {
            return (
                localPermissions.canPublish &&
                (localPermissions.canPublishSources.length === 0 ||
                    localPermissions.canPublishSources.includes(trackSourceToProtocol(source)))
            );
        };
        visibleControls.camera = visibleControls.camera && canPublishSource(Track.Source.Camera);
        visibleControls.microphone =
            visibleControls.microphone && canPublishSource(Track.Source.Microphone);
        visibleControls.screenShare =
            visibleControls.screenShare && canPublishSource(Track.Source.ScreenShare);
        visibleControls.chat = visibleControls.chat && localPermissions.canPublishData;
    }

    const showIcon = React.useMemo(
        () => variation === 'minimal' || variation === 'verbose',
        [variation],
    );
    const showText = React.useMemo(
        () => variation === 'textOnly' || variation === 'verbose',
        [variation],
    );

    const browserSupportsScreenSharing = supportsScreenSharing();

    const [isScreenShareEnabled, setIsScreenShareEnabled] = React.useState(false);

    const htmlProps = { ...props, className: `lk-control-bar ${props.className || ''}`.trim() };

    const {
        saveAudioInputEnabled,
        saveVideoInputEnabled,
        saveAudioInputDeviceId,
        saveVideoInputDeviceId,
    } = usePersistentUserChoices({ preventSave: !saveUserChoices });

    const microphoneOnChange = React.useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
            isUserInitiated ? saveAudioInputEnabled(enabled) : null,
        [saveAudioInputEnabled],
    );

    const cameraOnChange = React.useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
            isUserInitiated ? saveVideoInputEnabled(enabled) : null,
        [saveVideoInputEnabled],
    );

    return (
        <div {...htmlProps} data-pip-mode={pipMode}>
            {visibleControls.invite && (
                <button
                    className="lk-button rounded-full!"
                    title="Copy Invite Link"
                    onClick={() =>
                        navigator.clipboard
                            .writeText(window.location.href)
                            .then(() => toast.success('Link copied to clipboard'))
                            .catch(() => toast.error('Failed to copy link'))
                    }
                >
                    {showIcon && <Copy size={16} />}
                    {showText && 'Invite'}
                </button>
            )}
            <div className="flex items-center justify-center gap-2">
                {visibleControls.microphone && (
                    <div className="lk-button-group">
                        <TrackToggle
                            className="rounded-l-full!"
                            source={Track.Source.Microphone}
                            showIcon={showIcon}
                            onChange={microphoneOnChange}
                            onDeviceError={(error) =>
                                onDeviceError?.({ source: Track.Source.Microphone, error })
                            }
                        >
                            {showText && 'Microphone'}
                        </TrackToggle>
                        <div className="lk-button-group-menu">
                            <MediaDeviceMenu
                                kind="audioinput"
                                data-rounded-r="true"
                                onActiveDeviceChange={(_kind, deviceId) =>
                                    saveAudioInputDeviceId(deviceId ?? 'default')
                                }
                            />
                        </div>
                    </div>
                )}
                {visibleControls.camera && (
                    <div className="lk-button-group">
                        <TrackToggle
                            className="rounded-l-full!"
                            source={Track.Source.Camera}
                            showIcon={showIcon}
                            onChange={cameraOnChange}
                            onDeviceError={(error) =>
                                onDeviceError?.({ source: Track.Source.Camera, error })
                            }
                        >
                            {showText && 'Camera'}
                        </TrackToggle>
                        <div className="lk-button-group-menu">
                            <MediaDeviceMenu
                                kind="videoinput"
                                data-rounded-r="true"
                                onActiveDeviceChange={(_kind, deviceId) =>
                                    saveVideoInputDeviceId(deviceId ?? 'default')
                                }
                            />
                        </div>
                    </div>
                )}
                {(visibleControls.agent || (visibleControls.recording && recordingEndpoint)) && (
                    <div className="lk-button-group">
                        {visibleControls.agent && (
                            <button
                                className={`lk-button ${visibleControls.recording && recordingEndpoint ? 'rounded-l-full!' : 'rounded-full!'}`}
                                title="Add DVAI Agent"
                                aria-pressed={agentOpen}
                                disabled={agentOpen}
                                onClick={() => {
                                    fetch('/api/agent', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ roomName: roomContext?.name }),
                                    })
                                        .then(() => {
                                            toast.success('AI Agent dispatched to the room!');
                                            setAgentOpen(true);
                                        })
                                        .catch((err) =>
                                            console.error('Failed to dispatch agent', err),
                                        );
                                }}
                            >
                                {showIcon && <Bot size={16} />}
                                {showText && 'Add AI Agent'}
                            </button>
                        )}
                        {visibleControls.recording && recordingEndpoint && (
                            <button
                                className={`lk-button ${visibleControls.agent ? 'rounded-r-full!' : 'rounded-full!'}`}
                                disabled={processingRecRequest}
                                onClick={() => toggleRoomRecording()}
                                title={isRecording ? 'Stop Recording' : 'Start Recording'}
                            >
                                {showIcon &&
                                    (isRecording ? (
                                        <Square size={16} className="fill-red-500 text-red-500" />
                                    ) : (
                                        <Circle size={16} />
                                    ))}
                                {showText && (isRecording ? 'Stop Rec' : 'Record')}
                            </button>
                        )}
                    </div>
                )}
                {visibleControls.screenShare && browserSupportsScreenSharing && (
                    <TrackToggle
                        className="rounded-full!"
                        source={Track.Source.ScreenShare}
                        captureOptions={{ audio: true, selfBrowserSurface: 'include' }}
                        showIcon={false}
                        onChange={setIsScreenShareEnabled}
                        onClick={() => {
                            if (pipMode) {
                                // In PiP mode, clicking should close the window
                                onPipToggle?.();
                            } else if (!isScreenShareEnabled) {
                                // Open PiP immediately to capture the gesture
                                onPipToggle?.();
                            }
                        }}
                        onDeviceError={(error) =>
                            onDeviceError?.({ source: Track.Source.ScreenShare, error })
                        }
                        title={pipMode ? 'Stop Presenting' : 'Share Screen'}
                    >
                        {showIcon && (
                            <MonitorUp
                                size={16}
                                className={isScreenShareEnabled ? 'text-red-500' : ''}
                            />
                        )}
                        {showText &&
                            (isScreenShareEnabled
                                ? pipMode
                                    ? 'Stop Presenting'
                                    : 'Stop screen share'
                                : 'Share screen')}
                    </TrackToggle>
                )}
                {(visibleControls.hand || visibleControls.emoji) && (
                    <div className="lk-button-group">
                        {visibleControls.hand && (
                            <button
                                className={`lk-button ${visibleControls.emoji ? 'rounded-l-full!' : 'rounded-full!'}`}
                                aria-pressed={isHandRaised}
                                onClick={() =>
                                    localParticipant?.setAttributes({
                                        handRaised: isHandRaised ? 'false' : 'true',
                                    })
                                }
                                title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
                            >
                                {/* {showIcon && <Hand size={16} color={isHandRaised ? '#f91f31' : '#fff'} />} */}
                                {showIcon && (
                                    <span
                                        className={`material-symbols-outlined text-[16px]! ${isHandRaised ? 'text-red-500' : 'text-white'}`}
                                    >
                                        back_hand
                                    </span>
                                )}
                                {showText && (isHandRaised ? 'Lower Hand' : 'Raise Hand')}
                            </button>
                        )}
                        {visibleControls.emoji && (
                            <div className="relative" ref={emojiMenuRef}>
                                <button
                                    className={`lk-button ${visibleControls.hand ? 'rounded-r-full!' : 'rounded-full!'}`}
                                    aria-pressed={isEmojiMenuOpen}
                                    onClick={() => setIsEmojiMenuOpen(!isEmojiMenuOpen)}
                                    title="Send emoji"
                                >
                                    {showIcon && <Smile size={16} />}
                                    {showText && 'emoji'}
                                </button>
                                {isEmojiMenuOpen && (
                                    <div
                                        className="absolute left-1/2 -translate-x-1/2 mb-2 z-50 lk-device-menu -top-[80px]! p-0! bg-transparent! border-0! shadow-none!"
                                        style={{ visibility: 'visible' }}
                                    >
                                        <EmojiPicker
                                            theme={Theme.DARK}
                                            reactionsDefaultOpen={true}
                                            reactions={[
                                                '1f44d', //like
                                                '2764-fe0f', //heart
                                                '1f603', //smile
                                                '1f973', //excited
                                                '1f923', //laugh
                                                '1f622', //cry
                                                '1f621', //angry
                                                '1f614', //sad
                                                '1f64f', //thanks
                                                '1f44e', //dislike
                                            ]}
                                            onReactionClick={handleReaction}
                                            allowExpandReactions={false}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {visibleControls.transcription && (
                    <button
                        className="lk-button rounded-full!"
                        aria-pressed={showTranscription ?? false}
                        onClick={() => onTranscriptionToggle?.(!showTranscription)}
                        title="Show Transcriptions"
                    >
                        {showIcon && (
                            <span className="material-symbols-outlined text-xl">subtitles</span>
                        )}
                        {showText && 'Transcriptions'}
                    </button>
                )}
                {visibleControls.pip && (
                    <button
                        className="lk-button rounded-full!"
                        onClick={() => onPipToggle?.()}
                        title="Open Mini Player (PiP)"
                    >
                        {showIcon && <PictureInPicture size={16} />}
                        {showText && 'Mini Player'}
                    </button>
                )}
                {visibleControls.participants && (
                    <button
                        className="lk-button rounded-full!"
                        aria-pressed={showParticipants ?? false}
                        onClick={() => onParticipantsToggle?.(!showParticipants)}
                        title="Participants"
                        data-lk-unread-msgs={
                            isAdmin && waitingCount > 0
                                ? waitingCount < 10
                                    ? waitingCount.toString()
                                    : '9+'
                                : '0'
                        }
                    >
                        {showIcon && <UsersRound size={16} />}
                        {showText && 'Participants'}
                    </button>
                )}
                {visibleControls.chat && (
                    <ChatToggle className="rounded-full!">
                        {showIcon && <MessageSquareText size={16} />}
                        {showText && 'Chat'}
                    </ChatToggle>
                )}
                {visibleControls.settings && (
                    <button
                        className="lk-button rounded-full!"
                        aria-pressed={layoutContext?.widget.state?.showSettings ?? false}
                        onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
                        title="Media Settings"
                    >
                        {showIcon && <SettingsIcon size={16} />}
                        {showText && 'Settings'}
                    </button>
                )}
            </div>
            {visibleControls.leave && (
                <DisconnectButton className="rounded-full!" title="Leave">
                    {showIcon && <PhoneOff size={16} />}
                    {showText && 'Leave'}
                </DisconnectButton>
            )}
            <StartMediaButton />
        </div>
    );
}
