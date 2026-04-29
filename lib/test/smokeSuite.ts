import { embedderService } from '@/lib/embedder';
import { llmService } from '@/lib/llmService';
import { db } from '@/lib/db';
import { searchWithLlamaIndex } from '@/lib/rag/llamaindex';
import { runTest } from '@/lib/test/runIntelligenceTest';
import { MOCK_MEETING_ROOM } from '@/lib/test/mockMeeting';
import { WebSpeechAdapter } from '@/lib/transcription/adapters/webSpeechAdapter';
import { WhisperLocalAdapter } from '@/lib/transcription/adapters/whisperLocalAdapter';
import type { TranscriberAdapter } from '@/lib/transcription/types';
import type {
    SmokeReport,
    StageResult,
    SmokeProgress,
    DeviceInfo,
    StageStatus,
} from './smokeSuiteTypes';
import { THRESHOLDS, classifyDevice, rate } from './smokeSuiteThresholds';

export interface RunSmokeSuiteOptions {
    /** Run the live-mic transcription tier check. Default false (requires user gesture). */
    includeMicTier?: boolean;
    /** Skip the AI pipeline stage (fastest mode). Default false. */
    skipAiPipeline?: boolean;
    onProgress?: SmokeProgress;
}

const heap = (): number | undefined => (performance as any).memory?.usedJSHeapSize;

const collectDevice = (): DeviceInfo => ({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0,
    ramGB: typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined,
    hasWebGPU: typeof navigator !== 'undefined' && Boolean((navigator as any).gpu),
});

/**
 * Wraps an async stage with timing + heap snapshots and threshold-aware
 * status assignment. Catches errors and converts them to `fail` rather
 * than letting them abort the whole suite.
 */
async function runStage(
    name: string,
    fn: (extra: Record<string, unknown>) => Promise<void>,
    statusFromMs: (ms: number) => StageStatus,
    deltaThreshold?: { pass: number; warn: number },
): Promise<StageResult> {
    const startMs = performance.now();
    const beforeHeapBytes = heap();
    const extra: Record<string, unknown> = {};
    let status: StageStatus = 'pass';
    let message: string | undefined;
    try {
        await fn(extra);
    } catch (err) {
        status = 'fail';
        message = err instanceof Error ? err.message : String(err);
    }
    const endMs = performance.now();
    const afterHeapBytes = heap();
    const durationMs = endMs - startMs;
    const deltaHeapBytes =
        beforeHeapBytes !== undefined && afterHeapBytes !== undefined
            ? afterHeapBytes - beforeHeapBytes
            : undefined;

    if (status === 'pass') {
        status = statusFromMs(durationMs);
    }
    // Memory check can downgrade a pass to warn; never upgrades.
    if (status !== 'fail' && deltaHeapBytes !== undefined && deltaThreshold) {
        const memStatus = rate(deltaHeapBytes, deltaThreshold);
        if (memStatus === 'fail') status = 'fail';
        else if (memStatus === 'warn' && status === 'pass') status = 'warn';
    }

    return {
        name,
        startMs,
        endMs,
        durationMs,
        beforeHeapBytes,
        afterHeapBytes,
        deltaHeapBytes,
        extra,
        status,
        message,
    };
}

function emit(stage: StageResult, cb?: SmokeProgress) {
    cb?.(stage);
}

function skippedStage(name: string, reason: string): StageResult {
    return {
        name,
        startMs: 0,
        endMs: 0,
        durationMs: 0,
        status: 'skipped',
        message: reason,
    };
}

/**
 * Runs each stage in sequence, captures metrics, returns a structured
 * report. Each stage is independent — a failure in one does not abort
 * subsequent stages (except where there's a hard data dependency,
 * e.g. RAG depends on embedder being loaded).
 */
export async function runFullSmokeSuite(
    opts: RunSmokeSuiteOptions = {},
): Promise<SmokeReport> {
    const t0 = performance.now();
    const device = collectDevice();
    const cls = classifyDevice(device);
    const t = THRESHOLDS[cls];
    const stages: StageResult[] = [];

    // Stage 1: Embedder load
    const embedderLoad = await runStage(
        'embedder.load',
        async () => {
            await embedderService.embed(''); // triggers lazy init
        },
        (ms) => rate(ms, t.embedderLoadMs),
        t.perStageHeapDeltaBytes,
    );
    stages.push(embedderLoad);
    emit(embedderLoad, opts.onProgress);

    // Stage 2: Embedder first non-empty embed
    const embedderFirst = await runStage(
        'embedder.firstEmbed',
        async (extra) => {
            const v = await embedderService.embed('hello world');
            extra.dim = v.length;
        },
        (ms) => rate(ms, t.embedderFirstEmbedMs),
    );
    stages.push(embedderFirst);
    emit(embedderFirst, opts.onProgress);

    // Stage 3: Gemma load (skipped on budget-mobile)
    let gemmaLoad: StageResult;
    if (cls === 'budget-mobile') {
        gemmaLoad = skippedStage(
            'gemma.load',
            'Skipped on budget-mobile device class — Gemma 4 not viable in real-time',
        );
    } else if (!t.gemmaLoadMs) {
        gemmaLoad = skippedStage('gemma.load', 'No threshold defined for this device class');
    } else {
        gemmaLoad = await runStage(
            'gemma.load',
            async () => {
                await llmService.initialize();
            },
            (ms) => rate(ms, t.gemmaLoadMs!),
            t.perStageHeapDeltaBytes,
        );
    }
    stages.push(gemmaLoad);
    emit(gemmaLoad, opts.onProgress);

    // Stage 4: Gemma first inference
    let gemmaFirst: StageResult;
    if (gemmaLoad.status === 'skipped' || gemmaLoad.status === 'fail') {
        gemmaFirst = skippedStage('gemma.firstInference', 'Skipped: Gemma load did not succeed');
    } else if (!t.gemmaFirstInferenceMs) {
        gemmaFirst = skippedStage('gemma.firstInference', 'No threshold defined');
    } else {
        gemmaFirst = await runStage(
            'gemma.firstInference',
            async (extra) => {
                const model = llmService.getModel();
                const { HumanMessage } = await import('@langchain/core/messages');
                const res = await model.invoke([new HumanMessage('Reply with a single word: ok.')]);
                const text = (res.content as string) ?? '';
                extra.responseChars = text.length;
            },
            (ms) => rate(ms, t.gemmaFirstInferenceMs!),
        );
    }
    stages.push(gemmaFirst);
    emit(gemmaFirst, opts.onProgress);

    // Stage 5: Transcription tier check (only if mic gesture allowed)
    let transcriptionStage: StageResult;
    if (!opts.includeMicTier) {
        transcriptionStage = skippedStage(
            'transcription.firstChunk',
            'Skipped: includeMicTier=false (requires explicit user gesture for mic)',
        );
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const adapter: TranscriberAdapter =
                cls === 'modern-desktop' ? new WhisperLocalAdapter() : new WebSpeechAdapter();
            transcriptionStage = await runStage(
                `transcription.firstChunk(${adapter.tier})`,
                async (extra) => {
                    extra.tier = adapter.tier;
                    extra.model = adapter.model ?? 'n/a';
                    const latency = await new Promise<number>((resolve, reject) => {
                        const timeout = setTimeout(
                            () => reject(new Error('no transcript in 20s — speak into the mic')),
                            20000,
                        );
                        adapter.onTranscript(() => {
                            clearTimeout(timeout);
                            resolve(performance.now());
                        });
                        adapter.start(stream, 'smoke-test').catch(reject);
                    });
                    extra.firstTranscriptMs = latency;
                },
                (ms) => rate(ms, t.transcriptionFirstMs),
            );
            await adapter.stop();
            stream.getTracks().forEach((tr) => tr.stop());
        } catch (err) {
            transcriptionStage = {
                name: 'transcription.firstChunk',
                startMs: 0,
                endMs: 0,
                durationMs: 0,
                status: 'fail',
                message: err instanceof Error ? err.message : String(err),
            };
        }
    }
    stages.push(transcriptionStage);
    emit(transcriptionStage, opts.onProgress);

    // Stage 6: Ingest mock meeting (30 utterances, with embeddings)
    const ingest = await runStage(
        'ingest.mockMeeting',
        async (extra) => {
            // Clear any prior smoke-test rows
            await db.transcripts.where('room_name').equals(MOCK_MEETING_ROOM).delete();
            const { MOCK_UTTERANCES } = await import('@/lib/test/mockMeeting');
            const { ingestTranscript } = await import('@/lib/db');
            for (const line of MOCK_UTTERANCES) {
                await ingestTranscript(line.speaker, line.text, MOCK_MEETING_ROOM, {
                    language: 'en-US',
                    tier: 'web-speech',
                });
            }
            const count = await db.transcripts.where('room_name').equals(MOCK_MEETING_ROOM).count();
            extra.rows = count;
        },
        () => 'pass', // no time threshold; this is bookkeeping
    );
    stages.push(ingest);
    emit(ingest, opts.onProgress);

    // Stage 7: RAG retrieval end-to-end
    const ragStage = await runStage(
        'rag.retrieval',
        async (extra) => {
            const queryVec = await embedderService.embed('What was discussed about the project timeline?');
            const results = await searchWithLlamaIndex(queryVec, MOCK_MEETING_ROOM, 5);
            extra.hitCount = results.length;
        },
        (ms) => rate(ms, t.ragRetrievalMs),
    );
    stages.push(ragStage);
    emit(ragStage, opts.onProgress);

    // Stage 8: Full AI pipeline (uses runIntelligenceTest — slow!)
    let pipelineStage: StageResult;
    if (opts.skipAiPipeline) {
        pipelineStage = skippedStage('aiPipeline.full', 'Skipped: skipAiPipeline=true');
    } else if (gemmaLoad.status === 'skipped' || gemmaLoad.status === 'fail') {
        pipelineStage = skippedStage('aiPipeline.full', 'Skipped: Gemma not available');
    } else if (!t.fullPipelineMs) {
        pipelineStage = skippedStage('aiPipeline.full', 'No threshold defined for this device');
    } else {
        pipelineStage = await runStage(
            'aiPipeline.full',
            async (extra) => {
                const result = await runTest();
                extra.passed = result.passed;
                extra.summaryChars = (result.summary || '').length;
                extra.actionItemsChars = (result.actionItems || '').length;
                extra.questionsChars = (result.questions || '').length;
                if (!result.passed) {
                    throw new Error(`Pipeline failed: ${result.failures.join('; ')}`);
                }
            },
            (ms) => rate(ms, t.fullPipelineMs!),
        );
    }
    stages.push(pipelineStage);
    emit(pipelineStage, opts.onProgress);

    const durationMs = performance.now() - t0;
    const overall = computeOverall(stages);
    return {
        timestamp: Date.now(),
        durationMs,
        device,
        stages,
        overall,
    };
}

function computeOverall(stages: StageResult[]): SmokeReport['overall'] {
    if (stages.some((s) => s.status === 'fail')) return 'fail';
    if (stages.some((s) => s.status === 'warn')) return 'pass-with-warnings';
    return 'pass';
}
