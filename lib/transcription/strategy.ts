import { probeHardware } from './hardwareProbe';
import { runCapabilityBenchmark } from './benchmark';
import type { StrategyResult, Tier, WhisperModel } from './types';
// isPaidUser is intentionally NOT imported here — transcription
// strategy runs in the browser based on hardware probing, with no
// user context. Even when we previously included it in the cache
// fingerprint, the strategy selection didn't depend on it (cloud is
// gone, so there's no paid-tier-only path). If we later add a
// paid-only "premium local model," wire userId into SelectStrategyArgs
// and call lib/auth/subscription:isPaidUser from a server boundary.

/**
 * User-facing transcription preference. The `cloud` option was removed on
 * 2026-06-13 when Deepgram was dropped from the product — falling back to a
 * cloud STT provider conflicts with the "audio never leaves the device"
 * privacy MOAT.
 */
export type UserPreference =
    | 'auto' // hardware probe decides
    | 'local-ai' // force local Whisper; fall back to Web Speech if hardware can't
    | 'basic'; // force Web Speech

export interface SelectStrategyArgs {
    pref: UserPreference;
}

const CACHE_KEY = 'dvai.transcription.strategy.v1';
let inMemoryCache: { fingerprint: string; result: StrategyResult } | null = null;

export async function selectStrategy(args: SelectStrategyArgs): Promise<StrategyResult> {
    const probe = probeHardware();
    const fingerprintKey = `${probe.fingerprint}|pref:${args.pref}`;

    const cached = readCache(fingerprintKey);
    if (cached) return cached;

    const result = await compute(args, probe);
    writeCache(fingerprintKey, result);
    return result;
}

async function compute(
    args: SelectStrategyArgs,
    probe: ReturnType<typeof probeHardware>,
): Promise<StrategyResult> {
    // 1. User override beats probe
    if (args.pref === 'basic') {
        return mk('web-speech', undefined, 'user-override', 'User picked Basic (Web Speech)');
    }
    if (args.pref === 'local-ai') {
        if (probe.category === 'definitely-tier-3') {
            return mk(
                'web-speech',
                undefined,
                'static-probe',
                'User picked Local AI but hardware cannot run Whisper in real-time',
            );
        }
        return mk('local-whisper', probe.recommendedModel, 'user-override', 'User picked Local AI');
    }

    // 2. Auto path
    if (probe.category === 'definitely-tier-2') {
        return mk('local-whisper', probe.recommendedModel, 'static-probe', probe.reasoning);
    }
    if (probe.category === 'definitely-tier-3') {
        return mk('web-speech', undefined, 'static-probe', probe.reasoning);
    }

    // Borderline → run benchmark
    try {
        const bench = await runCapabilityBenchmark();
        if (bench.recommendedTier === 'local-whisper') {
            return mk(
                'local-whisper',
                bench.recommendedModel,
                'benchmark',
                `Benchmark passed at ${bench.realtimeFactor.toFixed(2)}× real-time`,
            );
        }
        return mk(
            'web-speech',
            undefined,
            'benchmark',
            `Benchmark failed (${bench.realtimeFactor.toFixed(2)}× real-time); using Web Speech`,
        );
    } catch (err) {
        return mk(
            'web-speech',
            undefined,
            'static-probe',
            `Benchmark failed to run; defaulting to Web Speech (${(err as Error).message})`,
        );
    }
}

function mk(
    tier: Tier,
    model: WhisperModel | undefined,
    source: StrategyResult['source'],
    reasoning: string,
): StrategyResult {
    return { tier, model, source, reasoning };
}

function readCache(fpKey: string): StrategyResult | null {
    if (inMemoryCache?.fingerprint === fpKey) {
        return { ...inMemoryCache.result, source: 'cache' };
    }
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.fingerprint === fpKey) {
            inMemoryCache = { fingerprint: fpKey, result: parsed.result };
            return { ...parsed.result, source: 'cache' };
        }
    } catch {
        // Corrupt cache — silently ignore.
    }
    return null;
}

function writeCache(fpKey: string, result: StrategyResult): void {
    inMemoryCache = { fingerprint: fpKey, result };
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fingerprint: fpKey, result }));
    } catch {
        // Quota or denied — non-fatal.
    }
}

/** Test seam. */
export function _resetStrategyCache(): void {
    inMemoryCache = null;
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch {}
    }
}
