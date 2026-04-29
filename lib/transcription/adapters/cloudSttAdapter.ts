import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
} from '../types';

/**
 * CloudSttAdapter — Tier 1. Streams mic audio to Deepgram Nova-3 over
 * WebSocket. Native multilingual + code-switching + punctuation.
 *
 * Auth: fetched from /api/transcription/cloud-token, which gates on
 * isPaidUser(). Connection is direct from browser → Deepgram (no
 * audio proxying through our servers, lowest latency).
 *
 * Reconnect: 3 retries with exponential backoff on disconnect.
 */

export interface CloudSttAdapterOptions {
    tokenEndpoint?: string;
    /** Deepgram model. Default 'nova-3' (best multilingual). */
    model?: string;
    /** Enable code-switching detection. Default true. */
    detectLanguage?: boolean;
}

const PCM_CHUNK_MS = 250; // Deepgram recommends 100-250ms chunks
const RECONNECT_DELAYS_MS = [500, 2000, 5000];

export class CloudSttAdapter implements TranscriberAdapter {
    readonly tier = 'cloud' as const;
    readonly model: string;

    private opts: Required<CloudSttAdapterOptions>;
    private ws: WebSocket | null = null;
    private ctx: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private worklet: ScriptProcessorNode | null = null;
    private listeners = new Set<TranscriptionListener>();
    private speaker = '';
    private stream: MediaStream | null = null;
    private cleanedUp = false;
    private reconnectIdx = 0;

    constructor(opts: CloudSttAdapterOptions = {}) {
        this.opts = {
            tokenEndpoint: opts.tokenEndpoint ?? '/api/transcription/cloud-token',
            model: opts.model ?? 'nova-3',
            detectLanguage: opts.detectLanguage ?? true,
        };
        this.model = this.opts.model;
    }

    async start(audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.ws) return;
        this.speaker = speaker;
        this.stream = audioStream;
        this.cleanedUp = false;
        await this.connectAndStream();
    }

    private async connectAndStream(): Promise<void> {
        const tokenRes = await fetch(this.opts.tokenEndpoint, { method: 'POST' });
        if (!tokenRes.ok) {
            throw new Error(`Cloud STT auth failed (${tokenRes.status})`);
        }
        const { token, baseUrl } = await tokenRes.json();

        const params = new URLSearchParams({
            model: this.opts.model,
            punctuate: 'true',
            interim_results: 'true',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
        });
        if (this.opts.detectLanguage) params.set('detect_language', 'true');

        this.ws = new WebSocket(`${baseUrl}?${params.toString()}`, [
            'token',
            token,
        ]);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => this.beginPcmPump();
        this.ws.onmessage = (e) => this.handleMessage(e);
        this.ws.onerror = (e) => console.warn('[CloudSttAdapter] ws error', e);
        this.ws.onclose = () => this.handleDisconnect();
    }

    private beginPcmPump(): void {
        if (!this.stream) return;
        this.ctx = new AudioContext({ sampleRate: 16000 });
        this.source = this.ctx.createMediaStreamSource(this.stream);
        const bufferSize = Math.max(
            256,
            Math.round((PCM_CHUNK_MS / 1000) * this.ctx.sampleRate),
        );
        const proc = (this.ctx as any).createScriptProcessor(bufferSize, 1, 1);
        this.worklet = proc;
        proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (this.cleanedUp || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const ch = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(ch.length);
            for (let i = 0; i < ch.length; i++) {
                const s = Math.max(-1, Math.min(1, ch[i]));
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            this.ws.send(pcm.buffer);
        };
        this.source.connect(proc);
        proc.connect(this.ctx.destination);
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);
            const channel = data.channel;
            if (!channel) return;
            const alt = channel.alternatives?.[0];
            if (!alt) return;
            const text: string = alt.transcript ?? '';
            if (!text || text.trim().length === 0) return;
            const isFinal = !!data.is_final;
            const language: string | null =
                data.detected_language ?? data.language ?? null;
            this.emit({
                speaker: this.speaker,
                text,
                isFinal,
                language,
                tier: 'cloud',
                timestamp: Date.now(),
            });
        } catch (err) {
            console.warn('[CloudSttAdapter] failed to parse msg', err);
        }
    }

    private handleDisconnect(): void {
        if (this.cleanedUp) return;
        if (this.reconnectIdx >= RECONNECT_DELAYS_MS.length) {
            console.warn('[CloudSttAdapter] giving up after retries');
            return;
        }
        const delay = RECONNECT_DELAYS_MS[this.reconnectIdx++];
        console.warn(`[CloudSttAdapter] reconnecting in ${delay}ms`);
        setTimeout(() => {
            if (!this.cleanedUp) {
                this.connectAndStream().catch((err) => {
                    console.error('[CloudSttAdapter] reconnect failed', err);
                });
            }
        }, delay);
    }

    async stop(): Promise<void> {
        this.cleanedUp = true;
        try {
            this.worklet?.disconnect();
        } catch {}
        try {
            this.source?.disconnect();
        } catch {}
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch {}
            this.ctx = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
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
                console.warn('[CloudSttAdapter] listener threw', err);
            }
        }
    }
}
