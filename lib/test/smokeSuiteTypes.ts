/**
 * Types for the Full Smoke Suite — see
 * docs/superpowers/specs/2026-04-30-smoke-tests-design.md
 */

export type StageStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface StageResult {
    name: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    /** JS heap size in bytes (Chrome only via performance.memory). */
    beforeHeapBytes?: number;
    afterHeapBytes?: number;
    deltaHeapBytes?: number;
    /** Stage-specific metrics (e.g. retrieval count, summary length). */
    extra?: Record<string, unknown>;
    status: StageStatus;
    message?: string;
}

export interface DeviceInfo {
    userAgent: string;
    cores: number;
    ramGB?: number;
    hasWebGPU: boolean;
}

export interface SmokeReport {
    timestamp: number;
    durationMs: number;
    device: DeviceInfo;
    stages: StageResult[];
    overall: 'pass' | 'pass-with-warnings' | 'fail';
}

export type SmokeProgress = (stage: StageResult) => void;

export type DeviceClass = 'modern-desktop' | 'budget-mobile';

export interface ThresholdRange {
    pass: number;
    warn: number;
}

/** Threshold per stage, in ms (or bytes for memory). Status tier
 *  is determined by `value <= pass → pass`, `value <= warn → warn`,
 *  else `fail`. Stages without thresholds always pass. */
export interface ThresholdSet {
    embedderLoadMs: ThresholdRange;
    embedderFirstEmbedMs: ThresholdRange;
    gemmaLoadMs?: ThresholdRange;
    gemmaFirstInferenceMs?: ThresholdRange;
    transcriptionFirstMs: ThresholdRange;
    ragRetrievalMs: ThresholdRange;
    fullPipelineMs?: ThresholdRange;
    perStageHeapDeltaBytes: ThresholdRange;
}
