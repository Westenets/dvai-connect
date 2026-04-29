import { probeHardware } from './hardwareProbe';
import { runCapabilityBenchmark } from './benchmark';
import { isPaidUser } from '@/lib/auth/subscription';
import type { StrategyResult, Tier, WhisperModel } from './types';

export type UserPreference =
    | 'auto' // hardware probe decides
    | 'local-ai' // force Tier 2; fall back to Tier 3 if hardware can't
    | 'basic' // force Tier 3
    | 'cloud'; // request Tier 1 (paid only; falls back if not paid)

export interface SelectStrategyArgs {
    pref: UserPreference;
}

const CACHE_KEY = 'dvai.transcription.strategy.v1';
let inMemoryCache: { fingerprint: string; result: StrategyResult } | null = null;

export async function selectStrategy(args: SelectStrategyArgs): Promise<StrategyResult> {
    const probe = probeHardware();
    const fingerprintKey = `${probe.fingerprint}|pref:${args.pref}|paid:${isPaidUser() ? 1 : 0}`;

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
    // 1. User override beats everything except invalid combos
    if (args.pref === 'basic') {
        return mk('web-speech', undefined, 'user-override', 'User picked Basic (Web Speech)');
    }
    if (args.pref === 'cloud') {
        if (isPaidUser()) {
            return mk('cloud', undefined, 'paid-cloud-pref', 'User picked Cloud and is on a paid plan');
        }
        return mk(
            probe.category === 'definitely-tier-3' ? 'web-speech' : 'local-whisper',
            probe.recommendedModel,
            'static-probe',
            'User picked Cloud but is not paid; falling back to best free tier',
        );
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
            `Benchmark failed (${bench.realtimeFactor.toFixed(2)}× real-time); using Tier 3`,
        );
    } catch (err) {
        return mk(
            'web-speech',
            undefined,
            'static-probe',
            `Benchmark failed to run; defaulting to Tier 3 (${(err as Error).message})`,
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
