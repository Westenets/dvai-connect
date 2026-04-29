import { describe, it, expect } from 'vitest';
import { alignByTimestamp } from '../alignmentByTimestamp';

describe('alignByTimestamp', () => {
    it('returns empty when no references provided', () => {
        const out = alignByTimestamp(
            [{ text: 'hi', language: 'en', timestampMs: 1000 }],
            [],
        );
        expect(out).toEqual([]);
    });

    it('assigns each chunk to nearest-timestamp reference speaker', () => {
        const refs = [
            { speaker: 'alice', timestampMs: 0 },
            { speaker: 'bob', timestampMs: 5000 },
            { speaker: 'alice', timestampMs: 10000 },
        ];
        const newChunks = [
            { text: 'hi', language: 'en', timestampMs: 100 },
            { text: 'hey', language: 'en', timestampMs: 4900 },
            { text: 'k', language: 'en', timestampMs: 9500 },
        ];
        const out = alignByTimestamp(newChunks, refs);
        expect(out.map((c) => c.speaker)).toEqual(['alice', 'bob', 'alice']);
    });

    it('preserves text and language', () => {
        const refs = [{ speaker: 'alice', timestampMs: 0 }];
        const newChunks = [{ text: 'hola', language: 'es', timestampMs: 100 }];
        const out = alignByTimestamp(newChunks, refs);
        expect(out).toEqual([{ text: 'hola', language: 'es', timestampMs: 100, speaker: 'alice' }]);
    });
});
