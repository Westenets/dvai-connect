import { DvAI, type CreatePipelineFn } from "@dvai-edge/core";
import { ChatOpenAI } from "@langchain/openai";

const MOCK_URL = "https://api.openai.local/v1/chat/completions";
const BASE_URL = "https://api.openai.local/v1";

/**
 * Custom pipeline factory for Gemma 4 E2B.
 * Loads the model + processor directly (bypassing pipeline() which doesn't
 * support image-text-to-text) and returns a pipeline-compatible callable.
 */
/**
 * Custom pipeline factory for Gemma 4 E2B (text-only mode).
 *
 * Uses Gemma4ForCausalLM instead of Gemma4ForConditionalGeneration.
 * Transformers.js detects the cross-architecture load (ForCausalLM → ForConditionalGeneration)
 * and sets textOnly=true, which skips loading vision_encoder (~99MB) and audio_encoder (~171MB).
 * This saves ~270MB of downloads and significant GPU memory.
 */
const createGemma4Pipeline: CreatePipelineFn = async (transformers, ctx) => {
    const { AutoProcessor, Gemma4ForCausalLM } = transformers;

    // AutoProcessor has the chat template; AutoTokenizer does not for Gemma 4.
    const processor = await AutoProcessor.from_pretrained(ctx.modelId, {
        progress_callback: ctx.onProgress,
    });

    // Gemma4ForCausalLM triggers text-only mode in transformers.js:
    // it detects ForCausalLM loading a ForConditionalGeneration model and
    // sets textOnly=true, skipping vision_encoder (~99MB) and audio_encoder (~171MB).
    const model = await Gemma4ForCausalLM.from_pretrained(ctx.modelId, {
        dtype: ctx.dtype,
        device: ctx.device,
        progress_callback: ctx.onProgress,
    });

    console.log('[LLMService] Gemma 4 model loaded (text-only mode, vision/audio encoders skipped).');

    // Return a pipeline-compatible callable: (messages, options) => [{ generated_text }]
    return async (messages: any, options: any) => {
        const prompt = processor.apply_chat_template(messages, {
            enable_thinking: false,
            add_generation_prompt: true,
        });
        // Use processor for tokenization (text-only: pass null for image/audio)
        const inputs = await processor(prompt, null, null, { add_special_tokens: false });
        const outputs = await model.generate({
            ...inputs,
            max_new_tokens: options?.max_new_tokens ?? 512,
            temperature: options?.temperature ?? 1.0,
            top_p: options?.top_p ?? 0.95,
            do_sample: options?.do_sample ?? true,
        });
        // Slice off input tokens to get only the generated portion
        const promptLength = inputs.input_ids.dims.at(-1);
        const generatedTokens = outputs.slice(null, [promptLength, null]);
        const decoded = processor.batch_decode(generatedTokens, { skip_special_tokens: true });
        return [{ generated_text: decoded[0] ?? "" }];
    };
};

class LLMService {
    private dvai: DvAI | null = null;
    private model: ChatOpenAI | null = null;
    private initPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        if (typeof window === 'undefined') {
            throw new Error('[LLMService] Cannot initialize in SSR context.');
        }

        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.dvai = new DvAI({
            backend: "transformers",
            transformersModelId: "onnx-community/gemma-4-E2B-it-ONNX",
            pipelineTask: "image-text-to-text",
            dtype: "q4f16",
            device: "webgpu",
            generationTimeout: 300_000,
            transformersWorkerUrl: "",  // Skip worker — custom pipeline runs on main thread
            mockUrl: MOCK_URL,
            createPipeline: createGemma4Pipeline,
        });

        this.initPromise = this.dvai.initialize().then(() => {
            console.log('[LLMService] DvAI initialized with MSW endpoint.');
        });

        await this.initPromise;

        this.model = new ChatOpenAI({
            apiKey: "not-needed",
            configuration: {
                baseURL: BASE_URL,
            },
            temperature: 0,
            maxTokens: 512,
        });
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

    async unload(): Promise<void> {
        if (this.dvai) {
            await this.dvai.unload();
            this.dvai = null;
            this.model = null;
            this.initPromise = null;
            console.log('[LLMService] Unloaded.');
        }
    }
}

export const llmService = new LLMService();
