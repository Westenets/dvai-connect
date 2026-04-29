import { alignByTimestamp, type NewChunk, type ReferenceRow } from './alignmentByTimestamp';
import { isPaidUser } from '@/lib/auth/subscription';
import { db, type TranscriptTier } from '@/lib/db';
import { embedderService } from '@/lib/embedder';

export interface ReTranscriptionOptions {
    /** Where the recording lives — server URL. */
    recordingAudioUrl: string;
    roomName: string;
    /**
     * Implementation of "transcribe a chunk of audio" — typically wraps
     * a CloudSttAdapter or WhisperLocalAdapter call. Injected so this
     * service is unit-testable and adapter-agnostic.
     */
    transcribeChunk: (
        pcm: Float32Array,
        opts: { sampleRate: number },
    ) => Promise<{ text: string; language: string | null }>;
    /** Tier to record on the resulting Dexie rows. */
    resultTier: 'cloud-rerun' | 'local-rerun';
    onProgress?: (info: { processedSec: number; totalSec: number }) => void;
}

/**
 * ReTranscriptionService — paid-only post-meeting transcript upgrade.
 *
 * Loads the recording's audio, chunks it, transcribes each chunk via
 * the injected `transcribeChunk` callback, aligns each new chunk to
 * the existing speaker-labeled transcripts by timestamp, and replaces
 * the rows in Dexie. Embeddings are regenerated for the replaced rows.
 */
export async function runReTranscription(opts: ReTranscriptionOptions): Promise<void> {
    if (!isPaidUser()) {
        throw new Error('Re-transcription requires a paid plan.');
    }

    // 1. Load audio
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const res = await fetch(opts.recordingAudioUrl);
    const buf = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(buf);
    const pcm = decoded.getChannelData(0);
    const totalSec = decoded.duration;

    // 2. Slice into 10s chunks (Whisper-friendly)
    const CHUNK_SEC = 10;
    const samplesPerChunk = CHUNK_SEC * 16000;
    const newChunks: NewChunk[] = [];
    for (let i = 0; i < pcm.length; i += samplesPerChunk) {
        const slice = pcm.subarray(i, i + samplesPerChunk);
        const result = await opts.transcribeChunk(slice, { sampleRate: 16000 });
        const centerMs = ((i + slice.length / 2) / 16000) * 1000;
        if (result.text.trim().length > 0) {
            newChunks.push({
                text: result.text,
                language: result.language,
                timestampMs: centerMs,
            });
        }
        opts.onProgress?.({
            processedSec: Math.min((i + slice.length) / 16000, totalSec),
            totalSec,
        });
    }
    await audioCtx.close();

    // 3. Build references from existing rows for this room
    const existingRows = await db.transcripts
        .where('room_name')
        .equals(opts.roomName)
        .toArray();
    if (existingRows.length === 0) {
        throw new Error(
            'No existing transcripts to align against; cannot preserve diarization.',
        );
    }
    const refs: ReferenceRow[] = existingRows.map((r: any) => ({
        speaker: r.speaker,
        timestampMs: r.timestamp,
    }));

    // 4. Align
    const aligned = alignByTimestamp(newChunks, refs);

    // 5. Replace rows: delete existing, insert aligned with re-embed
    await db.transcripts.where('room_name').equals(opts.roomName).delete();
    for (const a of aligned) {
        const embedding = a.text
            ? await embedderService.embed(a.text)
            : new Float32Array(384);
        await db.transcripts.add({
            room_name: opts.roomName,
            speaker: a.speaker,
            text: a.text,
            timestamp: a.timestampMs,
            embedding,
            language: a.language,
            tier: opts.resultTier as TranscriptTier,
        });
    }
}

/**
 * Default `transcribeChunk` implementation backed by Deepgram's
 * /v1/listen REST endpoint (prerecorded mode — cheaper than streaming
 * and well-suited to chunked re-transcription).
 *
 * The token comes from /api/transcription/cloud-token, gated to paid
 * users by isPaidUser().
 */
export async function cloudRestTranscribeChunk(
    pcm: Float32Array,
    _opts: { sampleRate: number },
): Promise<{ text: string; language: string | null }> {
    const tokenRes = await fetch('/api/transcription/cloud-token', { method: 'POST' });
    if (!tokenRes.ok) {
        throw new Error(`Cloud STT auth failed (${tokenRes.status})`);
    }
    const { token } = await tokenRes.json();

    // Convert Float32 → Int16 PCM bytes
    const pcm16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const url =
        'https://api.deepgram.com/v1/listen?' +
        new URLSearchParams({
            model: 'nova-3',
            punctuate: 'true',
            detect_language: 'true',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
        }).toString();

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Token ${token}`,
            'Content-Type': 'audio/raw',
        },
        body: pcm16.buffer,
    });
    if (!res.ok) {
        throw new Error(`Deepgram REST failed (${res.status})`);
    }
    const data = await res.json();
    const channel = data?.results?.channels?.[0];
    const text: string = channel?.alternatives?.[0]?.transcript ?? '';
    const language: string | null =
        channel?.detected_language ?? data?.results?.detected_language ?? null;
    return { text, language };
}
