import { DVAI } from "@westenets/dvai-bridge-core";
import { StatusEmitter, type AIServiceStatus } from "./aiServiceStatus";

const EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 hidden size

class EmbedderService {
    private embedAI: DVAI | null = null;
    private initPromise: Promise<void> | null = null;
    public readonly status = new StatusEmitter();

    /** Lazy-init the underlying DVAI instance. Idempotent. */
    private async getEmbedder(): Promise<DVAI> {
        if (!this.embedAI) {
            if (!this.initPromise) {
                this.embedAI = new DVAI({
                    backend: "transformers",
                    transformersModelId: "Xenova/all-MiniLM-L6-v2",
                    pipelineTask: "feature-extraction",
                    // No HTTP/MSW transport — we call runPipeline() directly.
                    transport: "none",
                    // Default transformersWorkerUrl ("/dvai-transformers.worker.js")
                    // runs the model in a Web Worker so it doesn't block the
                    // meeting UI on every transcription line.
                });

                this.status.emit({
                    state: 'loading',
                    progress: { text: 'Loading embedder…', progress: 0 },
                });

                const ai = this.embedAI;
                this.initPromise = ai
                    .initialize((info) => {
                        // dvai-bridge progress shape: { text, progress, timeElapsed }
                        this.status.emit({
                            state: 'loading',
                            progress: {
                                text: info?.text ?? 'Loading embedder…',
                                progress: typeof info?.progress === 'number' ? info.progress : -1,
                                timeElapsed: info?.timeElapsed,
                            },
                        });
                    })
                    .then(() => {
                        this.status.emit({ state: 'ready' });
                    })
                    .catch((err: unknown) => {
                        const error = err instanceof Error ? err : new Error(String(err));
                        this.status.emit({ state: 'error', error });
                        // Reset so a future call can retry.
                        this.embedAI = null;
                        this.initPromise = null;
                        throw error;
                    });
            }
            await this.initPromise;
        }
        return this.embedAI as DVAI;
    }

    async embed(text: string): Promise<Float32Array> {
        if (!text || text.trim() === '') {
            return new Float32Array(EMBEDDING_DIM);
        }
        const embedder = await this.getEmbedder();
        const result = await embedder.runPipeline(text);
        return this.extractEmbedding(result);
    }

    /**
     * Extracts a fixed-size embedding vector from the pipeline output.
     * The feature-extraction pipeline returns a tensor of shape [1, seq_len, 384].
     * We mean-pool across the sequence dimension to get a single 384-dim vector.
     */
    private extractEmbedding(result: any): Float32Array {
        if (!result) return new Float32Array(EMBEDDING_DIM);

        let data: number[] | Float32Array;
        if (result instanceof Float32Array) {
            data = result;
        } else if (result && result.data) {
            data = result.data;
        } else if (result && typeof result.tolist === 'function') {
            const list = result.tolist();
            data = Array.isArray(list) ? list.flat(Infinity) : list;
        } else if (Array.isArray(result)) {
            data = result.flat(Infinity);
        } else {
            console.warn('Embedder returned unexpected format, returning empty array');
            return new Float32Array(EMBEDDING_DIM);
        }

        if (data.length === EMBEDDING_DIM) {
            return data instanceof Float32Array ? data : new Float32Array(data);
        }

        // Mean-pool: shape [1, seq_len, 384] flattened to [seq_len * 384]
        if (data.length > EMBEDDING_DIM && data.length % EMBEDDING_DIM === 0) {
            const seqLen = data.length / EMBEDDING_DIM;
            const pooled = new Float32Array(EMBEDDING_DIM);
            for (let i = 0; i < data.length; i++) {
                pooled[i % EMBEDDING_DIM] += data[i];
            }
            for (let i = 0; i < EMBEDDING_DIM; i++) {
                pooled[i] /= seqLen;
            }
            return pooled;
        }

        // Fallback: truncate or pad to EMBEDDING_DIM
        console.warn(`Unexpected embedding length ${data.length}, expected ${EMBEDDING_DIM}`);
        const padded = new Float32Array(EMBEDDING_DIM);
        for (let i = 0; i < Math.min(data.length, EMBEDDING_DIM); i++) {
            padded[i] = data[i];
        }
        return padded;
    }

    /** Snapshot accessor (handy for non-React consumers). */
    getStatus(): AIServiceStatus {
        return this.status.get();
    }

    async unload(): Promise<void> {
        if (this.embedAI) {
            await this.embedAI.unload();
            this.embedAI = null;
            this.initPromise = null;
            this.status.emit({ state: 'unloaded' });
            console.log('[Embedder] Unloaded.');
        }
    }
}

export const embedderService = new EmbedderService();
