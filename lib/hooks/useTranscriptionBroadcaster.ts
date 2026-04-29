import { useEffect, useRef, useState } from 'react';
import {
    useRoomContext,
    useLocalParticipant,
    useRemoteParticipants,
} from '@livekit/components-react';
import toast from 'react-hot-toast';
import { ingestTranscript } from '../db';
import { selectStrategy, type UserPreference } from '../transcription/strategy';
import { AdaptiveMonitor } from '../transcription/adaptiveMonitor';
import { WebSpeechAdapter } from '../transcription/adapters/webSpeechAdapter';
import { WhisperLocalAdapter } from '../transcription/adapters/whisperLocalAdapter';
import { CloudSttAdapter } from '../transcription/adapters/cloudSttAdapter';
import type { TranscriberAdapter, Tier, WhisperModel } from '../transcription/types';

const DEFAULT_PREF: UserPreference = 'auto';
const PREF_STORAGE_KEY = 'dvai.transcription.userPref.v1';

function readUserPref(): UserPreference {
    if (typeof localStorage === 'undefined') return DEFAULT_PREF;
    const v = localStorage.getItem(PREF_STORAGE_KEY);
    if (v === 'auto' || v === 'local-ai' || v === 'basic' || v === 'cloud') return v;
    return DEFAULT_PREF;
}

function makeAdapter(tier: Tier, model?: WhisperModel): TranscriberAdapter {
    if (tier === 'web-speech') return new WebSpeechAdapter();
    if (tier === 'local-whisper') {
        return new WhisperLocalAdapter({ model: model ?? 'whisper-tiny' });
    }
    return new CloudSttAdapter();
}

/**
 * useTranscriptionBroadcaster — replaces useLocalTranscriptionBroadcaster.
 *
 * Picks a transcription tier via the strategy selector, runs the
 * matching adapter against the local mic, broadcasts every event over
 * LiveKit data, and ingests finals into Dexie. Watches for runtime
 * lag via AdaptiveMonitor and demotes one tier on chronic
 * fall-behind.
 */
export function useTranscriptionBroadcaster() {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    const isCcNeeded = remoteParticipants.some(
        (p: any) => p.attributes?.ccEnabled === 'true',
    );
    const isRecording = (room as any).isRecording;
    const isMicEnabled = localParticipant.isMicrophoneEnabled;
    const shouldRun = (isCcNeeded || isRecording) && isMicEnabled;

    const adapterRef = useRef<TranscriberAdapter | null>(null);
    const monitorRef = useRef<AdaptiveMonitor | null>(null);
    const cancelledRef = useRef(false);
    const [activeTier, setActiveTier] = useState<Tier | null>(null);

    useEffect(() => {
        cancelledRef.current = false;

        const tearDown = async () => {
            if (adapterRef.current) {
                try {
                    await adapterRef.current.stop();
                } catch {}
                adapterRef.current = null;
            }
            if (monitorRef.current) {
                monitorRef.current.stop();
                monitorRef.current = null;
            }
            setActiveTier(null);
        };

        if (!shouldRun) {
            tearDown();
            return;
        }

        let pref = readUserPref();

        const startWithTier = async (forcedTier?: Tier) => {
            const strategy = await selectStrategy({ pref });
            const chosenTier = forcedTier ?? strategy.tier;
            const chosenModel = forcedTier ? undefined : strategy.model;
            console.log('[useTranscriptionBroadcaster] strategy', { strategy, chosenTier });

            // Resolve mic stream from LiveKit local participant.
            const audioPub = (localParticipant as any).getTrackPublication?.('microphone');
            const stream = audioPub?.audioTrack?.mediaStream;
            if (!stream) {
                console.warn('[useTranscriptionBroadcaster] no mic track');
                return;
            }

            const adapter = makeAdapter(chosenTier, chosenModel);
            adapterRef.current = adapter;
            setActiveTier(chosenTier);

            adapter.onTranscript((event) => {
                if (cancelledRef.current) return;
                // Broadcast over LiveKit data
                const payload = {
                    utteranceId: `${localParticipant.identity}-${event.timestamp}`,
                    text: event.text,
                    isFinal: event.isFinal,
                    language: event.language,
                };
                const enc = new TextEncoder();
                room.localParticipant.publishData(
                    enc.encode(JSON.stringify(payload)),
                    { topic: 'transcription' } as any,
                );

                // Ingest finals to Dexie with tier + language metadata
                if (event.isFinal && event.text.trim()) {
                    ingestTranscript(
                        localParticipant.name || localParticipant.identity || 'You',
                        event.text,
                        room.name,
                        { language: event.language, tier: event.tier },
                    );
                }
            });

            try {
                await adapter.start(stream, localParticipant.identity ?? 'You');
            } catch (err) {
                console.error('[useTranscriptionBroadcaster] adapter start failed', err);
                toast.error(`Transcription unavailable on this tier (${chosenTier}). Falling back.`);
                if (chosenTier === 'cloud') {
                    pref = 'auto';
                    await startWithTier();
                } else if (chosenTier === 'local-whisper') {
                    await startWithTier('web-speech');
                }
                return;
            }

            // Adaptive monitor only meaningful for whisper-local (Tier 2)
            if (chosenTier === 'local-whisper') {
                const monitor = new AdaptiveMonitor({
                    onDemote: async () => {
                        if (cancelledRef.current) return;
                        toast(
                            'Switched to basic captions to keep up with the conversation. You can change this in Settings.',
                            { icon: 'ℹ️', duration: 5000 },
                        );
                        await tearDown();
                        await startWithTier('web-speech');
                    },
                });
                monitor.start();
                monitorRef.current = monitor;
                // Note: for v1 we don't auto-feed mic-bytes-per-second into
                // the monitor. The monitor remains a passive safety net;
                // a follow-up wires WhisperLocalAdapter latency into it.
            }
        };

        startWithTier();

        return () => {
            cancelledRef.current = true;
            tearDown();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldRun, localParticipant.identity, room]);

    return { activeTier };
}
