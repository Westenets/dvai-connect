import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
} from '../types';

/**
 * WebSpeechAdapter — Tier 3 fallback. Wraps the browser-native
 * SpeechRecognition API. Single-language at a time; the language tag
 * comes from `navigator.language` by default.
 *
 * Refactor of the original useLocalTranscriptionBroadcaster.ts logic.
 * Behavior preserved: continuous=false, interimResults=true, auto-restart on `onend`.
 */

export interface WebSpeechAdapterOptions {
    /** BCP-47 language tag, e.g. "en-US". Default: navigator.language or "en-US". */
    language?: string;
}

export class WebSpeechAdapter implements TranscriberAdapter {
    readonly tier = 'web-speech' as const;
    readonly model = 'webkitSpeechRecognition';

    private recognition: any = null;
    private listeners = new Set<TranscriptionListener>();
    private isCleanedUp = false;
    private speaker = '';
    private language: string;

    constructor(opts: WebSpeechAdapterOptions = {}) {
        this.language =
            opts.language ??
            (typeof navigator !== 'undefined' && navigator.language
                ? navigator.language
                : 'en-US');
    }

    async start(_audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.recognition) return;
        this.speaker = speaker;
        this.isCleanedUp = false;

        const Ctor =
            (globalThis as any).SpeechRecognition ||
            (globalThis as any).webkitSpeechRecognition;
        if (!Ctor) {
            throw new Error('SpeechRecognition API not available in this browser');
        }

        const r = new Ctor();
        r.continuous = false;
        r.interimResults = true;
        r.lang = this.language;

        r.onresult = (event: any) => {
            if (this.isCleanedUp) return;
            let fullTranscript = '';
            let anyFinal = false;
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
                if (event.results[i].isFinal) anyFinal = true;
            }
            this.emit({
                speaker: this.speaker,
                text: fullTranscript,
                isFinal: anyFinal,
                language: this.language,
                tier: 'web-speech',
                timestamp: Date.now(),
            });
        };

        r.onerror = (event: any) => {
            console.error('[WebSpeechAdapter] error', event.error);
        };

        r.onend = () => {
            if (this.isCleanedUp) return;
            try {
                r.start();
            } catch (e) {
                console.error('[WebSpeechAdapter] failed to restart', e);
            }
        };

        try {
            r.start();
            this.recognition = r;
        } catch (e) {
            console.error('[WebSpeechAdapter] failed to start', e);
            throw e;
        }
    }

    async stop(): Promise<void> {
        this.isCleanedUp = true;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.warn('[WebSpeechAdapter] stop error (benign)', e);
            }
            this.recognition = null;
        }
    }

    onTranscript(listener: TranscriptionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: TranscriptionEvent): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.warn('[WebSpeechAdapter] listener threw', err);
            }
        }
    }
}
