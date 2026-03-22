import { DvAI } from "@dvai-edge/core";
import { db } from '../db';

let llmInitPromise: Promise<void> | null = null;
let llm: DvAI | null = null;

async function getLLM() {
    if (!llm) {
        llm = new DvAI({
            backend: "transformers",
            transformersModelId: "Xenova/TinyLlama-1.1B-Chat-v1.0",
            pipelineTask: "text-generation"
        });
        if (!llmInitPromise) {
            llmInitPromise = llm.initialize().then(() => {});
        }
        await llmInitPromise;
    }
    return llm;
}

function extractResponseText(res: any): string {
    if (!res) return '';
    if (typeof res === 'string') return res;
    if (res.choices && res.choices.length > 0) return res.choices[0].message?.content || '';
    if (res.text) return res.text;
    return JSON.stringify(res);
}

self.onmessage = async (e: MessageEvent) => {
    const { action, roomName, startId, endId } = e.data;
    
    if (action === 'PROCESS_BATCH') {
        try {
            // Fetch chunks for this room within the ID range
            const chunks = await db.transcripts
               .where('room_name').equals(roomName)
               .filter(c => c.id !== undefined && c.id > startId && c.id <= endId)
               .toArray();
            
            if (chunks.length === 0) {
                // Nothing to do, but we should update the tracker to endId
                await updateTracker(roomName, endId);
                self.postMessage({ status: 'SUCCESS', endId, roomName });
                return;
            }
            
            const textToProcess = chunks.map(c => `[${c.speaker}]: ${c.text}`).join('\n');
            const ai = await getLLM();
            
            // 1. Action Items
            const actionPrompt = `Based on the following meeting transcript snippet, extract any action items discussed. If none, reply with exactly "None".\n\nTranscript:\n${textToProcess}\n\nAction Items:`;
            const actionRes = await ai.runPipeline([{ role: 'user', content: actionPrompt }]);
            const actionText = extractResponseText(actionRes).trim();
            if (actionText && actionText.toLowerCase() !== 'none') {
                await db.insights.add({ room_name: roomName, type: 'action_items', content: actionText, timestamp: Date.now() });
            }

            // 2. Summary
            const summaryPrompt = `Based on the following meeting transcript snippet, provide a concise rolling summary of what was discussed.\n\nTranscript:\n${textToProcess}\n\nSummary:`;
            const summaryRes = await ai.runPipeline([{ role: 'user', content: summaryPrompt }]);
            const summaryText = extractResponseText(summaryRes).trim();
            if (summaryText) {
                await db.insights.add({ room_name: roomName, type: 'summary', content: summaryText, timestamp: Date.now() });
            }

            // 3. Questions
            const qPrompt = `What are the unanswered questions from this transcript snippet? If none, reply with exactly "None".\n\nTranscript:\n${textToProcess}\n\nQuestions:`;
            const qRes = await ai.runPipeline([{ role: 'user', content: qPrompt }]);
            const qText = extractResponseText(qRes).trim();
            if (qText && qText.toLowerCase() !== 'none') {
                await db.insights.add({ room_name: roomName, type: 'questions', content: qText, timestamp: Date.now() });
            }
            
            await updateTracker(roomName, endId);
            self.postMessage({ status: 'SUCCESS', endId, roomName });
            
        } catch(err: any) {
            console.error('Worker processing error:', err);
            self.postMessage({ status: 'ERROR', error: err.message, roomName });
        }
    }
};

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
