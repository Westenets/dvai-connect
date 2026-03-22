import { DvAI } from "@dvai-edge/core";

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
            return new Float32Array(384); // typical minilm size empty
        }
        const embedder = await this.getEmbedder();
        const result = await embedder.runPipeline(text);
        
        // Handle various return types to extract a Float32Array
        if (result instanceof Float32Array) return result;
        if (Array.isArray(result)) return new Float32Array(result);
        if (result && result.data) return new Float32Array(result.data);
        if (result && typeof result.tolist === 'function') {
            const list = result.tolist();
            const flat = list.flat ? list.flat(Infinity) : list[0]; 
            return new Float32Array(flat);
        }
        
        console.warn('Embedder returned unexpected format, returning empty array');
        return new Float32Array(384);
    }
}

export const embedderService = new EmbedderService();
