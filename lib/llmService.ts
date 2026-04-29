import { DVAI } from "@westenets/dvai-bridge-core";
import { ChatOpenAI } from "@langchain/openai";
import { StatusEmitter, type AIServiceStatus } from "./aiServiceStatus";

const MOCK_URL = "https://api.openai.local/v1/chat/completions";
const BASE_URL = "https://api.openai.local/v1";

/**
 * LLMService — Gemma 4 E2B running in a Web Worker via @westenets/dvai-bridge-core.
 *
 * The previous implementation used a custom `createPipeline` factory to bypass
 * transformers.js's pipeline() (which doesn't natively handle image-text-to-text
 * for Gemma 4) and to skip downloading the vision/audio encoders we don't use.
 * That factory was a function closure, which can't be sent to a Web Worker, so
 * the pipeline ran on the main thread and froze the UI.
 *
 * dvai-bridge v2 adds a declarative equivalent (`transformersModelClass` +
 * `transformersDisableEncoders`) — plain strings that cross the worker
 * boundary. This loads `Gemma4ForCausalLM` instead of
 * `Gemma4ForConditionalGeneration`; transformers.js detects the
 * cross-architecture load and sets `textOnly=true`, skipping vision_encoder
 * (~99MB) and audio_encoder (~171MB). `transformersDisableEncoders` is a
 * belt-and-suspenders safety net that nulls those fields post-load if
 * anything slipped through.
 */
class LLMService {
    private dvai: DVAI | null = null;
    private model: ChatOpenAI | null = null;
    private initPromise: Promise<void> | null = null;
    public readonly status = new StatusEmitter();

    async initialize(): Promise<void> {
        if (typeof window === 'undefined') {
            throw new Error('[LLMService] Cannot initialize in SSR context.');
        }

        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.dvai = new DVAI({
            backend: "transformers",
            transformersModelId: "onnx-community/gemma-4-E2B-it-ONNX",
            pipelineTask: "image-text-to-text",
            dtype: "q4f16",
            device: "webgpu",
            generationTimeout: 300_000,
            // Declarative multimodal loader — runs in the worker. The worker
            // calls `Gemma4ForCausalLM.from_pretrained(modelId)` and applies
            // the disable-encoders pass post-load.
            transformersModelClass: "Gemma4ForCausalLM",
            transformersProcessorClass: "AutoProcessor",
            transformersDisableEncoders: ["vision_encoder", "audio_encoder"],
            // Default worker URL ("/dvai-transformers.worker.js") — the meet
            // app keeps this file in public/ via scripts/sync-workers.mjs.
            mockUrl: MOCK_URL,
            // transport defaults to "auto" → MSW in browser, which is what
            // LangChain's ChatOpenAI consumes via BASE_URL below.
        });

        this.status.emit({
            state: 'loading',
            progress: { text: 'Loading Gemma 4…', progress: 0 },
        });

        this.initPromise = this.dvai
            .initialize((info) => {
                this.status.emit({
                    state: 'loading',
                    progress: {
                        text: info?.text ?? 'Loading Gemma 4…',
                        progress: typeof info?.progress === 'number' ? info.progress : -1,
                        timeElapsed: info?.timeElapsed,
                    },
                });
            })
            .then(() => {
                this.model = new ChatOpenAI({
                    apiKey: "not-needed",
                    configuration: { baseURL: BASE_URL },
                    temperature: 0,
                    maxTokens: 512,
                });
                this.status.emit({ state: 'ready' });
                console.log('[LLMService] DVAI initialized with MSW endpoint.');
            })
            .catch((err: unknown) => {
                const error = err instanceof Error ? err : new Error(String(err));
                this.status.emit({ state: 'error', error });
                this.dvai = null;
                this.model = null;
                this.initPromise = null;
                throw error;
            });

        await this.initPromise;
    }

    getModel(): ChatOpenAI {
        if (!this.model) {
            throw new Error('[LLMService] Not initialized. Call initialize() first.');
        }
        return this.model;
    }

    get isInitialized(): boolean {
        return !!this.model;
    }

    /** Snapshot accessor (handy for non-React consumers). */
    getStatus(): AIServiceStatus {
        return this.status.get();
    }

    async unload(): Promise<void> {
        if (this.dvai) {
            await this.dvai.unload();
            this.dvai = null;
            this.model = null;
            this.initPromise = null;
            this.status.emit({ state: 'unloaded' });
            console.log('[LLMService] Unloaded.');
        }
    }
}

export const llmService = new LLMService();
