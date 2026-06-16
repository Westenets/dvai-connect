/**
 * Shared types for the transcription subsystem. The TranscriberAdapter
 * interface is the contract every tier (Local Whisper / Web Speech)
 * implements, so the strategy selector can swap them without the caller
 * knowing which tier is active.
 *
 * Cloud STT (Tier 1, Deepgram) was removed on 2026-06-13. The privacy MOAT
 * is "audio never leaves the device" — falling back to a cloud STT provider
 * would break that promise. When local AI can't run, we use Web Speech API
 * (browser-native, no audio sent to our servers). When neither viable,
 * transcription is OFF.
 */

export type Tier = 'local-whisper' | 'web-speech';

export type WhisperModel = 'whisper-tiny' | 'whisper-base';

export interface TranscriptionEvent {
    /** LiveKit local participant identity. Diarization is free here. */
    speaker: string;
    text: string;
    isFinal: boolean;
    /** BCP-47 tag (e.g. "en-US", "es-ES"); null when unknown. */
    language: string | null;
    tier: Tier;
    /** Date.now() at adapter emission. */
    timestamp: number;
}

export type TranscriptionListener = (event: TranscriptionEvent) => void;

export interface TranscriberAdapter {
    readonly tier: Tier;
    readonly model?: WhisperModel | string;

    /**
     * Begin transcribing audio from the given MediaStream. Idempotent:
     * calling start() on an already-started adapter must be a no-op.
     */
    start(audioStream: MediaStream, speaker: string): Promise<void>;

    /**
     * Stop transcribing and release resources. Idempotent.
     */
    stop(): Promise<void>;

    /**
     * Subscribe to transcript events. Returns an unsubscribe function.
     * Multiple listeners are supported.
     */
    onTranscript(listener: TranscriptionListener): () => void;
}

/**
 * Result of TranscriptionStrategySelector.select(). The "source" field
 * is for telemetry/debugging — tells the caller why this tier was
 * picked.
 */
export interface StrategyResult {
    tier: Tier;
    model?: WhisperModel;
    source: 'cache' | 'static-probe' | 'benchmark' | 'user-override';
    reasoning: string;
}
