import Dexie, { type EntityTable } from 'dexie';

export interface TranscriptRecord {
    id?: number;
    speaker: string;
    text: string;
    timestamp: number;
    room_name: string;
    embedding: Float32Array | number[]; // Dexie stores arrays
}

export interface ProcessingTracker {
    id?: number;
    room_name: string;
    lastProcessedId: number;
}

export interface InsightRecord {
    id?: number;
    room_name: string;
    type: 'summary' | 'action_items' | 'questions';
    content: string;
    timestamp: number;
}

class EdgeMeetingIntelligenceDB extends Dexie {
    transcripts!: EntityTable<TranscriptRecord, 'id'>;
    processing_tracker!: EntityTable<ProcessingTracker, 'id'>;
    insights!: EntityTable<InsightRecord, 'id'>;

    constructor() {
        super('EdgeMeetingIntelligenceDB');
        this.version(1).stores({
            transcripts: '++id, room_name, timestamp',
            processing_tracker: '++id, room_name',
            insights: '++id, room_name, type, timestamp',
        });
    }
}

export const db = new EdgeMeetingIntelligenceDB();

// Helper to handle the embedding injection and database transaction
export async function ingestTranscript(speaker: string, text: string, room_name: string) {
    if (!text.trim()) return;
    try {
        // dynamic import or reference to embedder
        const { embedderService } = await import('./embedder');
        const embedding = await embedderService.embed(text);
        await db.transcripts.add({
            speaker,
            text,
            timestamp: Date.now(),
            room_name,
            embedding
        });
    } catch (e) {
        console.error('Failed to ingest transcript to DB:', e);
    }
}
