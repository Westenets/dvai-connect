/**
 * AudioChunker — slices a MediaStream into utterance-sized PCM chunks
 * suitable for Whisper. Uses a simple RMS-energy threshold to detect
 * silence and chunk on it. Whisper handles 1–30s clips well; we aim
 * for 3–10s with a hard maximum of 15s to bound latency.
 *
 * This is intentionally simple. A future task can swap in Silero VAD
 * via transformers.js for better accuracy without changing the
 * consumer interface.
 */

export interface AudioChunkerOptions {
    /** Min chunk length before forced flush (ms). Default 1000. */
    minChunkMs?: number;
    /** Max chunk length before forced flush (ms). Default 15000. */
    maxChunkMs?: number;
    /** Silence duration that closes a chunk (ms). Default 600. */
    silenceMs?: number;
    /** RMS amplitude considered silence (0..1). Default 0.01. */
    silenceThreshold?: number;
    /** Sample rate Whisper expects. Default 16000. */
    targetSampleRate?: number;
}

export type AudioChunk = Float32Array;

export class AudioChunker {
    private opts: Required<AudioChunkerOptions>;
    private ctx: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private worklet: ScriptProcessorNode | null = null;
    private buffer: number[] = [];
    private silentRunMs = 0;
    private chunkStartMs = 0;
    private listeners = new Set<(chunk: AudioChunk) => void>();
    private running = false;

    constructor(options: AudioChunkerOptions = {}) {
        this.opts = {
            minChunkMs: options.minChunkMs ?? 1000,
            maxChunkMs: options.maxChunkMs ?? 15000,
            silenceMs: options.silenceMs ?? 600,
            silenceThreshold: options.silenceThreshold ?? 0.01,
            targetSampleRate: options.targetSampleRate ?? 16000,
        };
    }

    async start(stream: MediaStream): Promise<void> {
        if (this.running) return;
        this.running = true;
        this.ctx = new AudioContext({ sampleRate: this.opts.targetSampleRate });
        this.source = this.ctx.createMediaStreamSource(stream);

        // ScriptProcessorNode is deprecated but ubiquitous; we use it
        // for v1 portability. AudioWorklet upgrade is a follow-up.
        const proc = (this.ctx as any).createScriptProcessor(4096, 1, 1);
        this.worklet = proc;
        const sampleMs = (4096 / this.ctx.sampleRate) * 1000;

        proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (!this.running || !this.ctx) return;
            const ch = e.inputBuffer.getChannelData(0);
            // Compute RMS
            let sumSq = 0;
            for (let i = 0; i < ch.length; i++) sumSq += ch[i] * ch[i];
            const rms = Math.sqrt(sumSq / ch.length);

            // Append to buffer
            for (let i = 0; i < ch.length; i++) this.buffer.push(ch[i]);

            const elapsedMs = (this.buffer.length / this.ctx.sampleRate) * 1000;
            if (this.chunkStartMs === 0) this.chunkStartMs = Date.now();

            if (rms < this.opts.silenceThreshold) {
                this.silentRunMs += sampleMs;
            } else {
                this.silentRunMs = 0;
            }

            const closeOnSilence =
                elapsedMs >= this.opts.minChunkMs &&
                this.silentRunMs >= this.opts.silenceMs;
            const closeOnMax = elapsedMs >= this.opts.maxChunkMs;

            if (closeOnSilence || closeOnMax) {
                this.flush();
            }
        };

        this.source.connect(proc);
        proc.connect(this.ctx.destination);
    }

    private flush(): void {
        if (this.buffer.length === 0) return;
        const chunk = new Float32Array(this.buffer);
        this.buffer = [];
        this.silentRunMs = 0;
        this.chunkStartMs = 0;
        for (const cb of this.listeners) {
            try {
                cb(chunk);
            } catch (e) {
                console.warn('[AudioChunker] listener threw', e);
            }
        }
    }

    onChunk(cb: (chunk: AudioChunk) => void): () => void {
        this.listeners.add(cb);
        return () => {
            this.listeners.delete(cb);
        };
    }

    async stop(): Promise<void> {
        this.running = false;
        this.flush();
        if (this.worklet) {
            try {
                this.worklet.disconnect();
            } catch {}
            this.worklet = null;
        }
        if (this.source) {
            try {
                this.source.disconnect();
            } catch {}
            this.source = null;
        }
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch {}
            this.ctx = null;
        }
    }
}
