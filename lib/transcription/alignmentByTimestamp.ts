/**
 * Given a list of new transcript chunks (no speaker labels) and a list
 * of existing transcript rows (with speaker labels and timestamps),
 * assign each new chunk to the speaker whose existing-row timestamp is
 * closest. Used by re-transcription to preserve diarization.
 */

export interface NewChunk {
    text: string;
    language: string | null;
    /** Center-of-chunk timestamp, ms since recording start. */
    timestampMs: number;
}

export interface ReferenceRow {
    speaker: string;
    timestampMs: number;
}

export interface AlignedChunk extends NewChunk {
    speaker: string;
}

export function alignByTimestamp(
    newChunks: NewChunk[],
    references: ReferenceRow[],
): AlignedChunk[] {
    if (references.length === 0) return [];
    return newChunks.map((chunk) => {
        let best = references[0];
        let bestDelta = Math.abs(chunk.timestampMs - best.timestampMs);
        for (let i = 1; i < references.length; i++) {
            const d = Math.abs(chunk.timestampMs - references[i].timestampMs);
            if (d < bestDelta) {
                bestDelta = d;
                best = references[i];
            }
        }
        return { ...chunk, speaker: best.speaker };
    });
}
