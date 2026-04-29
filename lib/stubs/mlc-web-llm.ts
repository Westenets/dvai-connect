/**
 * Stub for @mlc-ai/web-llm.
 *
 * The meet app uses `backend: "transformers"` exclusively (Gemma 4 + the
 * MiniLM embedder both go through transformers.js). The compiled dist of
 * @westenets/dvai-bridge-core contains an `await import("@mlc-ai/web-llm")`
 * inside the WebLLMBackend code path, but Turbopack/webpack still try to
 * resolve it at build time. Aliasing to this stub satisfies the bundler
 * without pulling in the multi-MB web-llm runtime that we never invoke.
 *
 * If WebLLMBackend is ever actually instantiated at runtime, this Proxy
 * will throw — which is the correct failure mode (it tells you to use
 * transformers backend or install web-llm for real).
 */

const STUB_ERROR = new Error(
    "[mlc-web-llm stub] WebLLM backend is not available in the meet web app. " +
        "Use backend: 'transformers' (the default for this app) in DVAI config, " +
        "or install @mlc-ai/web-llm to enable WebLLM.",
);

const handler: ProxyHandler<object> = {
    get(_target, prop) {
        if (prop === Symbol.toPrimitive || prop === "toString" || prop === "then") {
            return undefined;
        }
        throw STUB_ERROR;
    },
};

const stub = new Proxy({}, handler);

// Common named exports the lib references — all proxy through the same trap.
export default stub;
export const CreateMLCEngine = stub as unknown as never;
export const WebWorkerMLCEngine = stub as unknown as never;
