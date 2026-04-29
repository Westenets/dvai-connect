import type { WhisperModel } from './types';

/**
 * Static hardware probe — millisecond-fast, no model download.
 *
 * Decision rules (informed by published benchmarks of transformers.js
 * + Whisper, mid-2025):
 *   - WebGPU + desktop + ≥8 cores + ≥4GB RAM → whisper-base, real-time
 *   - WebGPU + (mobile OR <8 cores OR <4GB) → whisper-tiny, real-time
 *   - No WebGPU + ≥8 cores + ≥4GB + desktop → borderline (run benchmark)
 *   - everything else → tier 3 (Web Speech)
 */

export interface HardwareProbeResult {
    category: 'definitely-tier-2' | 'borderline' | 'definitely-tier-3';
    recommendedModel?: WhisperModel;
    reasoning: string;
    /** Stable hash of the inputs — useful as cache key. */
    fingerprint: string;
}

const isMobileUa = (ua: string): boolean =>
    /iPhone|iPad|iPod|Android|Mobile/i.test(ua);

const safeGet = <T>(fn: () => T, fallback: T): T => {
    try {
        const v = fn();
        return v ?? fallback;
    } catch {
        return fallback;
    }
};

export function probeHardware(): HardwareProbeResult {
    const hasWebGPU = safeGet(() => Boolean((navigator as any).gpu), false);
    const cores = safeGet(() => navigator.hardwareConcurrency, 0);
    const ram = safeGet(() => (navigator as any).deviceMemory as number, 0);
    const ua = safeGet(() => navigator.userAgent, 'unknown');
    const mobile = isMobileUa(ua);

    const fingerprint = `${hasWebGPU ? 'gpu' : 'no-gpu'}|c${cores}|m${ram}|${mobile ? 'mob' : 'dsk'}`;

    if (hasWebGPU) {
        if (!mobile && cores >= 8 && ram >= 4) {
            return {
                category: 'definitely-tier-2',
                recommendedModel: 'whisper-base',
                reasoning:
                    'WebGPU + desktop + 8+ cores + 4GB+ RAM → whisper-base real-time',
                fingerprint,
            };
        }
        return {
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-tiny',
            reasoning: 'WebGPU available but mobile or constrained → whisper-tiny',
            fingerprint,
        };
    }

    // No WebGPU
    if (!mobile && cores >= 8 && ram >= 4) {
        return {
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: 'No WebGPU but capable CPU desktop — benchmark to confirm',
            fingerprint,
        };
    }

    return {
        category: 'definitely-tier-3',
        reasoning: hasWebGPU
            ? 'WebGPU present but mobile/constrained — Tier 3 fallback'
            : `No WebGPU + ${mobile ? 'mobile' : 'low-spec desktop'} (${cores} cores, ${ram}GB) → Tier 3`,
        fingerprint,
    };
}
