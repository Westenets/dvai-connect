import type { DeviceClass, ThresholdSet, DeviceInfo } from './smokeSuiteTypes';

/**
 * Per-device-class smoke-suite thresholds. Defaults derived from
 * published transformers.js + WebGPU benchmarks (mid-2025); calibrate
 * after running on a few real devices.
 */

const MODERN_DESKTOP: ThresholdSet = {
    embedderLoadMs: { pass: 8000, warn: 15000 },
    embedderFirstEmbedMs: { pass: 500, warn: 2000 },
    gemmaLoadMs: { pass: 60000, warn: 120000 },
    gemmaFirstInferenceMs: { pass: 8000, warn: 20000 },
    transcriptionFirstMs: { pass: 2000, warn: 5000 },
    ragRetrievalMs: { pass: 500, warn: 2000 },
    fullPipelineMs: { pass: 120000, warn: 240000 },
    perStageHeapDeltaBytes: { pass: 500 * 1024 * 1024, warn: 1500 * 1024 * 1024 },
};

const BUDGET_MOBILE: ThresholdSet = {
    embedderLoadMs: { pass: 30000, warn: 60000 },
    embedderFirstEmbedMs: { pass: 2000, warn: 5000 },
    // Gemma is skipped on this class — too slow to be useful
    transcriptionFirstMs: { pass: 2000, warn: 5000 },
    ragRetrievalMs: { pass: 2000, warn: 5000 },
    perStageHeapDeltaBytes: { pass: 300 * 1024 * 1024, warn: 800 * 1024 * 1024 },
};

export const THRESHOLDS: Record<DeviceClass, ThresholdSet> = {
    'modern-desktop': MODERN_DESKTOP,
    'budget-mobile': BUDGET_MOBILE,
};

/**
 * Classify a device based on the same signals our hardware probe uses.
 * Modern-desktop = WebGPU + ≥8 cores + ≥4GB + non-mobile UA.
 * Everything else falls into budget-mobile (which has more permissive
 * thresholds so we don't flag every older device as "fail").
 */
export function classifyDevice(d: DeviceInfo): DeviceClass {
    const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(d.userAgent);
    if (d.hasWebGPU && !isMobile && d.cores >= 8 && (d.ramGB ?? 0) >= 4) {
        return 'modern-desktop';
    }
    return 'budget-mobile';
}

/**
 * Returns 'pass' / 'warn' / 'fail' for a measured value against a
 * range. Lower-is-better metric (latency, memory).
 */
export function rate(value: number, range: { pass: number; warn: number }): 'pass' | 'warn' | 'fail' {
    if (value <= range.pass) return 'pass';
    if (value <= range.warn) return 'warn';
    return 'fail';
}
