import { HumanMessage } from "@langchain/core/messages";
import { llmService } from './llmService';
import { db } from './db';

// ── Module-level pipeline tracking ──────────────────────────────────────
// Pipelines are tracked here (not in React state) so they survive
// component unmounts — the user can navigate away and the pipeline
// keeps running until it finishes.

const activePipelines = new Map<string, Promise<void>>();

/** Returns true if a pipeline is currently running for the given room. */
export function isPipelineRunning(roomName: string): boolean {
    return activePipelines.has(roomName);
}

/**
 * Runs the full intelligence pipeline for a room if insights don't already
 * exist. Safe to call multiple times — subsequent calls join the existing
 * promise. Unloads the LLM when complete.
 */
export async function runFullPipelineForRoom(roomName: string): Promise<void> {
    // If already running for this room, join the existing promise
    if (activePipelines.has(roomName)) {
        return activePipelines.get(roomName)!;
    }

    const promise = (async () => {
        // Skip if insights already exist
        const existing = await db.insights.where('room_name').equals(roomName).count();
        if (existing > 0) {
            console.log(`[INTEL] Insights already exist for "${roomName}", skipping pipeline.`);
            return;
        }

        // Get full transcript range
        const all = await db.transcripts.where('room_name').equals(roomName).toArray();
        if (all.length === 0) {
            console.log(`[INTEL] No transcripts for "${roomName}", skipping pipeline.`);
            return;
        }

        const ids = all.map(c => c.id as number).filter(Boolean);
        console.log(`[INTEL] Running full pipeline for "${roomName}" (${all.length} transcripts)...`);
        await processBatch(roomName, 0, Math.max(...ids));

        // Unload LLM after completion to free memory
        await llmService.unload();
        console.log(`[INTEL] Full pipeline complete for "${roomName}".`);
    })();

    activePipelines.set(roomName, promise);
    try {
        await promise;
    } finally {
        activePipelines.delete(roomName);
    }
}

// ── Core batch processing ───────────────────────────────────────────────

/**
 * Core batch processing function.
 * Fetches transcript chunks for `roomName` in the ID range (startId, endId],
 * runs LLM prompts via the DvAI MSW endpoint (ChatOpenAI), and saves results
 * to the `insights` table.
 *
 * Must run on the main thread — DvAI uses MSW + its own transformers worker.
 */
export async function processBatch(roomName: string, startId: number, endId: number): Promise<{
    actionItems: string;
    summary: string;
    questions: string;
}> {
    console.log(`[INTEL] processBatch: room="${roomName}" range=(${startId}, ${endId}]`);

    await llmService.initialize();
    const model = llmService.getModel();

    const chunks = await db.transcripts
        .where('room_name').equals(roomName)
        .filter(c => c.id !== undefined && c.id > startId && c.id <= endId)
        .toArray();

    console.log(`[INTEL] Fetched ${chunks.length} chunks.`);

    const result = { actionItems: '', summary: '', questions: '' };

    if (chunks.length === 0) {
        await updateTracker(roomName, endId);
        return result;
    }

    const textToProcess = chunks.map(c => `[${c.speaker}]: ${c.text}`).join('\n');

    // 1. Action Items
    console.log('[INTEL] Running action_items prompt...');
    const actionPrompt = `Based on the following meeting transcript snippet, extract any action items discussed. If none, reply with exactly "None".\n\nTranscript:\n${textToProcess}\n\nAction Items:`;
    const actionRes = await model.invoke([new HumanMessage(actionPrompt)]);
    const actionText = (actionRes.content as string).trim();
    console.log(`[INTEL] action_items result: ${actionText}`);
    result.actionItems = actionText;
    if (actionText && actionText.toLowerCase() !== 'none') {
        await db.insights.add({ room_name: roomName, type: 'action_items', content: actionText, timestamp: Date.now() });
    }

    // 2. Summary
    console.log('[INTEL] Running summary prompt...');
    const summaryPrompt = `Based on the following meeting transcript snippet, provide a concise rolling summary of what was discussed.\n\nTranscript:\n${textToProcess}\n\nSummary:`;
    const summaryRes = await model.invoke([new HumanMessage(summaryPrompt)]);
    const summaryText = (summaryRes.content as string).trim();
    console.log(`[INTEL] summary result: ${summaryText}`);
    result.summary = summaryText;
    if (summaryText) {
        await db.insights.add({ room_name: roomName, type: 'summary', content: summaryText, timestamp: Date.now() });
    }

    // 3. Questions
    console.log('[INTEL] Running questions prompt...');
    const qPrompt = `What are the unanswered questions from this transcript snippet? If none, reply with exactly "None".\n\nTranscript:\n${textToProcess}\n\nQuestions:`;
    const qRes = await model.invoke([new HumanMessage(qPrompt)]);
    const qText = (qRes.content as string).trim();
    console.log(`[INTEL] questions result: ${qText}`);
    result.questions = qText;
    if (qText && qText.toLowerCase() !== 'none') {
        await db.insights.add({ room_name: roomName, type: 'questions', content: qText, timestamp: Date.now() });
    }

    await updateTracker(roomName, endId);
    console.log(`[INTEL] processBatch complete for room="${roomName}".`);
    return result;
}

async function updateTracker(roomName: string, endId: number) {
    let tracker = await db.processing_tracker.where('room_name').equals(roomName).first();
    if (tracker) {
        if (endId > tracker.lastProcessedId) {
            await db.processing_tracker.update(tracker.id!, { lastProcessedId: endId });
        }
    } else {
        await db.processing_tracker.add({ room_name: roomName, lastProcessedId: endId });
    }
}
