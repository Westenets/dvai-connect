import { DvAI } from "@dvai-edge/core";

const EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 hidden size

class EmbedderService {
    private embedAI: DvAI | null = null;
    private initPromise: Promise<void> | null = null;

    async getEmbedder() {
        if (!this.embedAI) {
            if (!this.initPromise) {
                this.embedAI = new DvAI({
                    backend: "transformers",
                    transformersModelId: "Xenova/all-MiniLM-L6-v2",
                    pipelineTask: "feature-extraction",
                    // Embedder only uses runPipeline() — MSW is not needed.
                    serviceWorkerUrl: "",
                });
                // The initialize method returns a boolean, so we chain .then to match Promise<void>
                this.initPromise = this.embedAI.initialize().then(() => {});
            }
            await this.initPromise;
        }
        return this.embedAI as DvAI;
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

        // Get the raw float data from whatever format the pipeline returns
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

        // If already the right size, return as-is (already pooled)
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

    async unload(): Promise<void> {
        if (this.embedAI) {
            await this.embedAI.unload();
            this.embedAI = null;
            this.initPromise = null;
            console.log('[Embedder] Unloaded.');
        }
    }
}

export const embedderService = new EmbedderService();
