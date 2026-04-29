import { DVAI } from '@westenets/dvai-bridge-core';
import type { Tier, WhisperModel } from './types';

export interface BenchmarkResult {
    realtimeFactor: number; // 1.0 = realtime; >1.0 = faster than realtime
    recommendedTier: Tier;
    recommendedModel?: WhisperModel;
    inferenceMs: number;
    audioLengthMs: number;
}

const SAMPLE_RATE = 16000;
const BENCHMARK_AUDIO_MS = 5000;

let cachedResult: BenchmarkResult | null = null;
let inFlight: Promise<BenchmarkResult> | null = null;

/**
 * Runs a one-shot whisper-tiny benchmark to determine if Tier 2 is
 * viable on this device. Memoized — the benchmark runs at most once
 * per page session. The result is also persisted to localStorage by
 * the strategy selector.
 */
export async function runCapabilityBenchmark(): Promise<BenchmarkResult> {
    if (cachedResult) return cachedResult;
    if (inFlight) return inFlight;
    inFlight = doBenchmark();
    try {
        cachedResult = await inFlight;
        return cachedResult;
    } finally {
        inFlight = null;
    }
}

async function doBenchmark(): Promise<BenchmarkResult> {
    const dvai = new DVAI({
        backend: 'transformers',
        transformersModelId: 'Xenova/whisper-tiny',
        pipelineTask: 'automatic-speech-recognition',
        transport: 'none',
    });

    try {
        await dvai.initialize();
        // Synthetic 5s of silence at 16kHz mono.
        const samples = new Float32Array(SAMPLE_RATE * (BENCHMARK_AUDIO_MS / 1000));

        const t0 = performance.now();
        await dvai.runPipeline(samples);
        const inferenceMs = performance.now() - t0;

        const realtimeFactor = BENCHMARK_AUDIO_MS / inferenceMs;
        const passed = realtimeFactor >= 1.5; // 50% headroom over real-time

        return {
            realtimeFactor,
            recommendedTier: passed ? 'local-whisper' : 'web-speech',
            recommendedModel: passed ? 'whisper-tiny' : undefined,
            inferenceMs,
            audioLengthMs: BENCHMARK_AUDIO_MS,
        };
    } finally {
        try {
            await dvai.unload();
        } catch (err) {
            console.warn('[benchmark] unload failed', err);
        }
    }
}

/** Test seam: clear the in-process cache. */
export function _resetBenchmarkCache(): void {
    cachedResult = null;
    inFlight = null;
}
