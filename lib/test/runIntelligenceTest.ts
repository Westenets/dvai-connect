import { db } from '@/lib/db';
import { ingestTranscript } from '@/lib/db';
import { processBatch } from '@/lib/intelligencePipeline';
import {
    MOCK_MEETING_ROOM,
    MOCK_UTTERANCES,
    EXPECTED_ACTION_KEYWORDS,
    EXPECTED_QUESTION_KEYWORDS,
} from './mockMeeting';

export interface TestResult {
    summary: string;
    actionItems: string;
    questions: string;
    passed: boolean;
    failures: string[];
    durationMs: number;
}

/**
 * Clears the test room data, injects mock utterances with embeddings,
 * runs the LLM pipeline, reads insights, and asserts expected keywords.
 *
 * IMPORTANT: This must be called from the MAIN PAGE THREAD, not from inside
 * a Web Worker. DvAI needs to spawn its own dvai-transformers.worker.js, and
 * browsers do not reliably support nested workers (worker → worker). Calling
 * this directly from the page lets DvAI spawn its inner worker normally.
 */
export async function runTest(): Promise<TestResult> {
    console.group('[TEST] Starting intelligence pipeline test...');
    const t0 = performance.now();

    // 1. Clear existing test data
    console.log('[TEST] Clearing previous test room data...');
    const oldIds = await db.transcripts.where('room_name').equals(MOCK_MEETING_ROOM).primaryKeys();
    await db.transcripts.bulkDelete(oldIds as number[]);
    const oldInsightIds = await db.insights.where('room_name').equals(MOCK_MEETING_ROOM).primaryKeys();
    await db.insights.bulkDelete(oldInsightIds as number[]);
    const oldTracker = await db.processing_tracker.where('room_name').equals(MOCK_MEETING_ROOM).first();
    if (oldTracker?.id) await db.processing_tracker.delete(oldTracker.id);
    console.log('[TEST] DB cleared for test room.');

    // 2. Inject mock utterances chunk-by-chunk (each gets embedded)
    console.log(`[TEST] Injecting ${MOCK_UTTERANCES.length} mock utterances...`);
    for (let i = 0; i < MOCK_UTTERANCES.length; i++) {
        const { speaker, text } = MOCK_UTTERANCES[i];
        console.log(`[TEST] Ingesting utterance ${i + 1}/${MOCK_UTTERANCES.length}: [${speaker}]`);
        await ingestTranscript(speaker, text, MOCK_MEETING_ROOM);
    }
    console.log('[TEST] All utterances ingested with embeddings.');

    // 3. Get IDs for the batch
    const allChunks = await db.transcripts.where('room_name').equals(MOCK_MEETING_ROOM).toArray();
    const ids = allChunks.map(c => c.id as number).filter(Boolean);
    const startId = 0;
    const endId = Math.max(...ids);
    console.log(`[TEST] Processing batch: IDs ${startId} → ${endId}`);

    // 4. Run pipeline directly on main thread.
    //    DvAI will spawn dvai-transformers.worker.js (its own inner worker) for model inference.
    //    This works because we're on the page's main thread — no nested worker issues.
    const pipelineResult = await processBatch(MOCK_MEETING_ROOM, startId, endId);

    // 5. Validate results
    const failures: string[] = [];
    const actionLower = pipelineResult.actionItems.toLowerCase();
    const questionsLower = pipelineResult.questions.toLowerCase();

    for (const kw of EXPECTED_ACTION_KEYWORDS) {
        if (!actionLower.includes(kw)) {
            failures.push(`Missing expected action keyword: "${kw}"`);
            console.warn(`[TEST] FAIL — action_items missing keyword: "${kw}"`);
        } else {
            console.log(`[TEST] PASS — action_items contains: "${kw}"`);
        }
    }

    for (const kw of EXPECTED_QUESTION_KEYWORDS) {
        if (!questionsLower.includes(kw)) {
            failures.push(`Missing expected question keyword: "${kw}"`);
            console.warn(`[TEST] FAIL — questions missing keyword: "${kw}"`);
        } else {
            console.log(`[TEST] PASS — questions contains: "${kw}"`);
        }
    }

    const durationMs = Math.round(performance.now() - t0);
    const passed = failures.length === 0;
    console.log(`[TEST] Result: ${passed ? '✅ PASSED' : '❌ FAILED'} (${durationMs}ms)`);
    if (!passed) console.warn('[TEST] Failures:', failures);
    console.groupEnd();

    return {
        summary: pipelineResult.summary,
        actionItems: pipelineResult.actionItems,
        questions: pipelineResult.questions,
        passed,
        failures,
        durationMs,
    };
}
