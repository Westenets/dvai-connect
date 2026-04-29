import Dexie, { type EntityTable } from 'dexie';

/**
 * Source tier of a transcript row. Live tiers are written by the
 * useTranscriptionBroadcaster hook; '*-rerun' values are written by
 * the paid re-transcription service. Existing rows from before the
 * v3 schema migration are backfilled to 'web-speech'.
 */
export type TranscriptTier =
    | 'web-speech'
    | 'local-whisper'
    | 'cloud'
    | 'cloud-rerun'
    | 'local-rerun';

export interface TranscriptRecord {
    id?: number;
    speaker: string;
    text: string;
    timestamp: number;
    room_name: string;
    embedding: Float32Array | number[]; // Dexie stores arrays
    /** BCP-47 language tag (e.g. "en-US") detected by the source tier; null when unknown. */
    language?: string | null;
    /** Which tier produced this row. */
    tier?: TranscriptTier;
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

export interface ChatMessage {
    id?: number;
    room_name: string;
    sender: string;
    text: string;
    timestamp: number;
    embedding: Float32Array | number[];
    media_url?: string;
    media_type?: string;  // 'image' | 'file' | 'video' | etc
    media_name?: string;  // Original filename
}

class EdgeMeetingIntelligenceDB extends Dexie {
    transcripts!: EntityTable<TranscriptRecord, 'id'>;
    processing_tracker!: EntityTable<ProcessingTracker, 'id'>;
    insights!: EntityTable<InsightRecord, 'id'>;
    chat_messages!: EntityTable<ChatMessage, 'id'>;

    constructor() {
        super('EdgeMeetingIntelligenceDB');
        this.version(1).stores({
            transcripts: '++id, room_name, timestamp',
            processing_tracker: '++id, room_name',
            insights: '++id, room_name, type, timestamp',
        });
        this.version(2).stores({
            transcripts: '++id, room_name, timestamp',
            processing_tracker: '++id, room_name',
            insights: '++id, room_name, type, timestamp',
            chat_messages: '++id, room_name, timestamp',
        });
        // v3: add language + tier columns to transcripts.
        // Backfill existing rows to ('en-US' best-guess for language, 'web-speech' for tier)
        // since pre-migration the only producer was the en-US Web Speech path.
        this.version(3)
            .stores({
                transcripts: '++id, room_name, timestamp, tier, language',
                processing_tracker: '++id, room_name',
                insights: '++id, room_name, type, timestamp',
                chat_messages: '++id, room_name, timestamp',
            })
            .upgrade(async (tx) => {
                const table = tx.table('transcripts');
                await table.toCollection().modify((row: any) => {
                    if (row.language === undefined) row.language = null;
                    if (row.tier === undefined) row.tier = 'web-speech';
                });
            });
    }
}

export const db = new EdgeMeetingIntelligenceDB();

/**
 * Helper to handle the embedding injection and database transaction.
 * `options.language` and `options.tier` are recorded for analytics and
 * to drive the paid "improve transcript quality" feature (which only
 * applies to rows where tier === 'web-speech').
 */
export async function ingestTranscript(
    speaker: string,
    text: string,
    room_name: string,
    options: { language?: string | null; tier?: TranscriptTier } = {},
) {
    if (!text.trim()) return;
    try {
        const { embedderService } = await import('./embedder');
        const embedding = await embedderService.embed(text);
        await db.transcripts.add({
            speaker,
            text,
            timestamp: Date.now(),
            room_name,
            embedding,
            language: options.language ?? null,
            tier: options.tier ?? 'web-speech',
        });
    } catch (e) {
        console.error('Failed to ingest transcript to DB:', e);
    }
}

// Helper to ingest chat messages with embeddings. Returns the DB id.
export async function ingestChatMessage(msg: Omit<ChatMessage, 'id' | 'embedding'>): Promise<number | undefined> {
    try {
        const { embedderService } = await import('./embedder');
        const embedding = msg.text ? await embedderService.embed(msg.text) : new Float32Array(384);
        const id = await db.chat_messages.add({
            ...msg,
            embedding,
        });
        return id;
    } catch (e) {
        console.error('Failed to ingest chat message to DB:', e);
        return undefined;
    }
}
