import { DVAI } from '@westenets/dvai-bridge-core';
import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
    WhisperModel,
} from '../types';
import { AudioChunker } from '../audioChunker';

/**
 * WhisperLocalAdapter — Tier 2. Runs Whisper-tiny or whisper-base in
 * a Web Worker via @westenets/dvai-bridge-core. Native multilingual,
 * auto-detects language per chunk, includes punctuation. Worker-thread
 * means no main-thread blocking.
 */

export interface WhisperLocalAdapterOptions {
    model?: WhisperModel;
    /** Chunker tuning. */
    chunker?: ConstructorParameters<typeof AudioChunker>[0];
}

const HF_MODEL_IDS: Record<WhisperModel, string> = {
    'whisper-tiny': 'Xenova/whisper-tiny',
    'whisper-base': 'Xenova/whisper-base',
};

export class WhisperLocalAdapter implements TranscriberAdapter {
    readonly tier = 'local-whisper' as const;
    readonly model: WhisperModel;

    private dvai: DVAI | null = null;
    private chunker: AudioChunker | null = null;
    private listeners = new Set<TranscriptionListener>();
    private speaker = '';
    private chunkerOpts: ConstructorParameters<typeof AudioChunker>[0];

    constructor(opts: WhisperLocalAdapterOptions = {}) {
        this.model = opts.model ?? 'whisper-tiny';
        this.chunkerOpts = opts.chunker ?? {};
    }

    async start(audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.dvai) return;
        this.speaker = speaker;

        this.dvai = new DVAI({
            backend: 'transformers',
            transformersModelId: HF_MODEL_IDS[this.model],
            pipelineTask: 'automatic-speech-recognition',
            transport: 'none',
            // Default worker URL — runs Whisper in a Web Worker.
        });
        await this.dvai.initialize();

        this.chunker = new AudioChunker(this.chunkerOpts);
        this.chunker.onChunk(async (chunk) => {
            const ai = this.dvai;
            if (!ai) return;
            try {
                const out = await ai.runPipeline(chunk, {
                    // language: undefined → auto-detect per chunk
                    return_timestamps: false,
                });
                const text = this.extractText(out);
                const lang = this.extractLanguage(out);
                if (text.trim().length === 0) return;
                this.emit({
                    speaker: this.speaker,
                    text,
                    isFinal: true,
                    language: lang,
                    tier: 'local-whisper',
                    timestamp: Date.now(),
                });
            } catch (err) {
                console.warn('[WhisperLocalAdapter] inference error', err);
            }
        });
        await this.chunker.start(audioStream);
    }

    async stop(): Promise<void> {
        if (this.chunker) {
            await this.chunker.stop();
            this.chunker = null;
        }
        if (this.dvai) {
            await this.dvai.unload();
            this.dvai = null;
        }
    }

    onTranscript(listener: TranscriptionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private extractText(out: any): string {
        if (!out) return '';
        if (typeof out === 'string') return out;
        if (typeof out.text === 'string') return out.text;
        if (Array.isArray(out) && out[0]?.text) return out[0].text;
        return '';
    }

    private extractLanguage(out: any): string | null {
        if (!out) return null;
        if (typeof out.language === 'string') return out.language;
        if (Array.isArray(out) && out[0]?.language) return out[0].language;
        return null;
    }

    private emit(event: TranscriptionEvent): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.warn('[WhisperLocalAdapter] listener threw', err);
            }
        }
    }
}
