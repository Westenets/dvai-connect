'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { Lock } from 'lucide-react';
import { decodePassphrase } from '@/lib/client-utils';
import { useAuth } from '@/components/AuthProvider';
import { databases } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';
import {
    formatChatMessageLinks,
    LocalUserChoices,
    PreJoin,
    RoomContext,
    useConnectionState,
} from '@livekit/components-react';
import {
    ExternalE2EEKeyProvider,
    RoomOptions,
    VideoCodec,
    VideoPresets,
    Room,
    DeviceUnsupportedError,
    RoomConnectOptions,
    RoomEvent,
    TrackPublishDefaults,
    VideoCaptureOptions,
    ConnectionState,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';
import { VideoConference } from '@/lib/VideoConference';

const CONN_DETAILS_ENDPOINT =
    process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
    roomName: string;
    region?: string;
    hq: boolean;
    codec: VideoCodec;
}) {
    const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
        undefined,
    );
    const { user } = useAuth();
    const prefs = user?.prefs as Record<string, any> | undefined;

    const preJoinDefaults = React.useMemo(() => {
        return {
            username: user?.name || '',
            videoEnabled: true,
            audioEnabled: true,
            videoDeviceId:
                prefs?.videoInputDevice && prefs.videoInputDevice !== 'default'
                    ? prefs.videoInputDevice
                    : undefined,
            audioDeviceId:
                prefs?.audioInputDevice && prefs.audioInputDevice !== 'default'
                    ? prefs.audioInputDevice
                    : undefined,
        };
    }, [user?.name, user?.prefs]);
    const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
        undefined,
    );

    const handlePreJoinSubmit = React.useCallback(
        async (values: LocalUserChoices) => {
            setPreJoinChoices(values);
            const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
            url.searchParams.append('roomName', props.roomName);
            url.searchParams.append('participantName', values.username);

            let isCreator = false;
            if (user) {
                try {
                    const response = await databases.listDocuments('dvai-connect', 'room_admins', [
                        Query.equal('roomId', props.roomName),
                        Query.equal('adminId', user.$id),
                    ]);
                    isCreator = response.total > 0;
                } catch (error) {
                    console.error('Failed to check admin status', error);
                }
            }
            url.searchParams.append('isCreator', isCreator.toString());

            const metaObj = prefs ? { ...prefs } : {};
            metaObj.isCreator = isCreator;

            url.searchParams.append('metadata', JSON.stringify(metaObj));

            if (props.region) {
                url.searchParams.append('region', props.region);
            }
            const connectionDetailsResp = await fetch(url.toString());
            const connectionDetailsData = await connectionDetailsResp.json();
            setConnectionDetails(connectionDetailsData);
        },
        [props.roomName, props.region, prefs],
    );
    const handlePreJoinError = React.useCallback((e: any) => console.error(e), []);

    return (
        <main
            className={`h-full`}
            data-lk-theme={`${connectionDetails === undefined || preJoinChoices === undefined ? (prefs?.appearance === 'light' ? prefs?.appearance : 'default') : 'default'}`}
            data-theme={`${connectionDetails === undefined || preJoinChoices === undefined ? (prefs?.appearance === 'light' ? prefs?.appearance : 'default') : 'default'}`}
        >
            {connectionDetails === undefined || preJoinChoices === undefined ? (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                    <PreJoin
                        defaults={preJoinDefaults}
                        onSubmit={handlePreJoinSubmit}
                        onError={handlePreJoinError}
                        joinLabel="Join"
                    />
                </div>
            ) : (
                <VideoConferenceComponent
                    roomName={props.roomName}
                    connectionDetails={connectionDetails}
                    userChoices={preJoinChoices}
                    options={{
                        codec: props.codec,
                        hq: prefs?.videoQuality === '1080' ? true : false,
                    }}
                />
            )}
        </main>
    );
}

function VideoConferenceComponent(props: {
    roomName: string;
    userChoices: LocalUserChoices;
    connectionDetails: ConnectionDetails;
    options: {
        hq: boolean;
        codec: VideoCodec;
    };
}) {
    const keyProvider = useMemo(() => new ExternalE2EEKeyProvider(), []);
    const { worker, e2eePassphrase } = useSetupE2EE();
    const e2eeEnabled = !!(e2eePassphrase && worker);

    const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);

    const roomOptions = React.useMemo((): RoomOptions => {
        let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
        if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
            videoCodec = undefined;
        }
        const videoCaptureDefaults: VideoCaptureOptions = {
            deviceId: props.userChoices.videoDeviceId ?? undefined,
            resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
        };
        const publishDefaults: TrackPublishDefaults = {
            dtx: false,
            videoSimulcastLayers: props.options.hq
                ? [VideoPresets.h1080, VideoPresets.h720]
                : [VideoPresets.h540, VideoPresets.h216],
            red: !e2eeEnabled,
            videoCodec,
        };
        return {
            videoCaptureDefaults: videoCaptureDefaults,
            publishDefaults: publishDefaults,
            audioCaptureDefaults: {
                deviceId: props.userChoices.audioDeviceId ?? undefined,
            },
            adaptiveStream: true,
            dynacast: true,
            e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
            singlePeerConnection: true,
        };
    }, [
        props.userChoices,
        props.options.hq,
        props.options.codec,
        e2eeEnabled,
        keyProvider,
        worker,
    ]);

    const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);

    React.useEffect(() => {
        if (e2eeEnabled) {
            keyProvider
                .setKey(decodePassphrase(e2eePassphrase))
                .then(() => {
                    room.setE2EEEnabled(true).catch((e) => {
                        if (e instanceof DeviceUnsupportedError) {
                            Swal.fire({
                                title: 'Error!',
                                text: 'You are trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.',
                                icon: 'error',
                            });
                            console.error(e);
                        } else {
                            throw e;
                        }
                    });
                })
                .then(() => setE2eeSetupComplete(true));
        } else {
            setE2eeSetupComplete(true);
        }
    }, [e2eeEnabled, room, e2eePassphrase, keyProvider]);

    const connectOptions = React.useMemo((): RoomConnectOptions => {
        return {
            autoSubscribe: true,
        };
    }, []);

    const lowPowerMode = useLowCPUOptimizer(room);

    const router = useRouter();
    const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
    const handleError = React.useCallback((error: Error) => {
        console.error(error);
    }, []);
    const handleEncryptionError = React.useCallback((error: Error) => {
        console.error(error);
    }, []);

    const [isWaiting, setIsWaiting] = useState(false);
    const roomState = useConnectionState(room);

    useEffect(() => {
        const checkWait = () => {
            const p = room.localParticipant;
            if (!p) return;
            try {
                const md = p.metadata ? JSON.parse(p.metadata) : {};
                if (md.status === 'waiting' && !p.permissions?.canPublish) {
                    setIsWaiting(true);
                } else {
                    setIsWaiting(false);
                }
            } catch (e) {
                setIsWaiting(false);
            }
        };

        checkWait(); // initial

        room.on(RoomEvent.Connected, checkWait);
        room.on(RoomEvent.ParticipantMetadataChanged, checkWait);
        room.on(RoomEvent.ParticipantPermissionsChanged, checkWait);

        return () => {
            room.off(RoomEvent.Connected, checkWait);
            room.off(RoomEvent.ParticipantMetadataChanged, checkWait);
            room.off(RoomEvent.ParticipantPermissionsChanged, checkWait);
        };
    }, [room]);

    useEffect(() => {
        room.on(RoomEvent.Disconnected, handleOnLeave);
        room.on(RoomEvent.EncryptionError, handleEncryptionError);
        room.on(RoomEvent.MediaDevicesError, handleError);

        if (e2eeSetupComplete) {
            room.connect(
                props.connectionDetails.serverUrl,
                props.connectionDetails.participantToken,
                connectOptions,
            )
                .then(() => {
                    if (props.userChoices.videoEnabled) {
                        room.localParticipant.setCameraEnabled(true).catch((error) => {
                            handleError(error);
                        });
                    }
                    if (props.userChoices.audioEnabled) {
                        room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
                            handleError(error);
                        });
                    }
                })
                .catch((error) => {
                    handleError(error);
                });
        }
        return () => {
            room.off(RoomEvent.Disconnected, handleOnLeave);
            room.off(RoomEvent.EncryptionError, handleEncryptionError);
            room.off(RoomEvent.MediaDevicesError, handleError);
        };
    }, [
        e2eeSetupComplete,
        room,
        props.connectionDetails,
        props.userChoices,
        connectOptions,
        handleOnLeave,
        handleEncryptionError,
        handleError,
    ]);

    const isConnecting =
        roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;

    return (
        <div className="lk-room-container">
            <RoomContext.Provider value={room}>
                {isConnecting ? (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#f5f7f8] dark:bg-[#101922]">
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse">
                                Connecting to meeting...
                            </p>
                        </div>
                    </div>
                ) : isWaiting ? (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#f5f7f8] dark:bg-[#101922]">
                        <div className="bg-white dark:bg-[#1e2936] rounded-2xl p-10 max-w-md w-full text-center shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center">
                            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-6">
                                <Lock className="w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                                Waiting for the host
                            </h2>
                            <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-[280px]">
                                We've let them know you're here. You'll be able to join as soon as
                                they admit you.
                            </p>
                            <div className="flex gap-2 items-center text-sm text-slate-500 bg-slate-100 dark:bg-slate-800/50 py-2 px-4 rounded-full">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                                Host notified
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <KeyboardShortcuts />
                        <VideoConference
                            chatMessageFormatter={formatChatMessageLinks}
                            SettingsComponent={SHOW_SETTINGS_MENU ? SettingsMenu : undefined}
                        />
                        <DebugMode />
                        <RecordingIndicator />
                    </>
                )}
            </RoomContext.Provider>
        </div>
    );
}
