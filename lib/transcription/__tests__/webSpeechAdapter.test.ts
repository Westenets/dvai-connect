import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSpeechAdapter } from '../adapters/webSpeechAdapter';

class MockRecognition {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    start = vi.fn(() => {
        this.started = true;
    });
    stop = vi.fn(() => {
        this.started = false;
        this.onend?.();
    });
    fireResult(transcript: string, isFinal: boolean) {
        this.onresult?.({
            results: [
                { 0: { transcript }, isFinal, length: 1 },
            ],
        });
    }
}

describe('WebSpeechAdapter', () => {
    let mockRec: MockRecognition;

    beforeEach(() => {
        mockRec = new MockRecognition();
        // Use a regular function (not arrow) so `new Ctor()` works.
        function Ctor(this: any) {
            return mockRec;
        }
        (globalThis as any).SpeechRecognition = Ctor as any;
    });

    it('emits a transcription event when recognition fires onresult', async () => {
        const adapter = new WebSpeechAdapter();
        const events: any[] = [];
        adapter.onTranscript((e) => events.push(e));

        await adapter.start({} as MediaStream, 'alice');
        mockRec.fireResult('hello world', true);

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            speaker: 'alice',
            text: 'hello world',
            isFinal: true,
            tier: 'web-speech',
        });
        expect(typeof events[0].timestamp).toBe('number');
    });

    it('marks isFinal=false for interim results', async () => {
        const adapter = new WebSpeechAdapter();
        const events: any[] = [];
        adapter.onTranscript((e) => events.push(e));

        await adapter.start({} as MediaStream, 'alice');
        mockRec.fireResult('hello', false);

        expect(events[0].isFinal).toBe(false);
    });

    it('stop() releases the recognition instance', async () => {
        const adapter = new WebSpeechAdapter();
        await adapter.start({} as MediaStream, 'alice');
        await adapter.stop();
        expect(mockRec.stop).toHaveBeenCalled();
    });

    it('multiple onTranscript subscribers all receive events', async () => {
        const adapter = new WebSpeechAdapter();
        const a: any[] = [];
        const b: any[] = [];
        adapter.onTranscript((e) => a.push(e));
        adapter.onTranscript((e) => b.push(e));

        await adapter.start({} as MediaStream, 'alice');
        mockRec.fireResult('test', true);
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
    });

    it('unsubscribe stops delivering events to that listener', async () => {
        const adapter = new WebSpeechAdapter();
        const events: any[] = [];
        const unsub = adapter.onTranscript((e) => events.push(e));

        await adapter.start({} as MediaStream, 'alice');
        unsub();
        mockRec.fireResult('test', true);

        expect(events).toHaveLength(0);
    });
});
