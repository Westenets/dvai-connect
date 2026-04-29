# Multi-language Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the en-US-locked Web Speech transcription with a hardware-aware 3-tier system (Cloud / Local Whisper / Web Speech) that handles multilingual speech and code-switching, plus an optional paid re-transcription pass on past recordings.

**Architecture:** A `TranscriptionStrategySelector` runs at app start, consulting a static hardware probe + (when borderline) a Whisper-tiny benchmark + user preferences + paid-tier state to pick a tier. The chosen tier instantiates one of three `TranscriberAdapter` implementations behind a shared interface. An `AdaptiveMonitor` watches the audio-vs-transcribed buffer during meetings and demotes tiers if the pipeline falls behind. Diarization comes free at every tier because each participant labels their own utterances at source.

**Tech Stack:** TypeScript / React / Next.js 16 (Turbopack), `@westenets/dvai-bridge-core` for transformers.js (Whisper), Deepgram Nova-3 WebSocket (Tier 1 default), `webkitSpeechRecognition` (Tier 3), Dexie (local DB), LiveKit (mic + data broadcast), vitest (tests).

---

## Pre-flight

Before starting any task:

- Confirm working tree is on branch `dvai-bridge-v2-migration` with no uncommitted changes (besides this plan).
- Confirm `pnpm install` completes cleanly.
- Confirm `pnpm build` passes (the v2 migration left the build green).
- Read the spec: `docs/superpowers/specs/2026-04-30-transcription-multilang-design.md`

## File structure (locked in this plan)

**Created:**
- `lib/transcription/types.ts` — shared types (`Tier`, `TranscriptionEvent`, `TranscriberAdapter`)
- `lib/transcription/hardwareProbe.ts` — static device-capability probe
- `lib/transcription/benchmark.ts` — on-demand whisper-tiny realtime benchmark
- `lib/transcription/adaptiveMonitor.ts` — runtime buffer-lag watcher
- `lib/transcription/strategy.ts` — selector that combines probe + benchmark + user prefs + paid state
- `lib/transcription/adapters/webSpeechAdapter.ts` — refactor of current logic
- `lib/transcription/adapters/whisperLocalAdapter.ts` — new (Whisper via dvai-bridge worker)
- `lib/transcription/adapters/cloudSttAdapter.ts` — new (Deepgram Nova-3 WebSocket)
- `lib/transcription/reTranscription.ts` — paid post-meeting re-transcription
- `lib/auth/subscription.ts` — `isPaidUser()` stub
- `lib/hooks/useTranscriptionBroadcaster.ts` — replaces `useLocalTranscriptionBroadcaster.ts`
- `app/api/transcription/cloud-token/route.ts` — server endpoint that mints short-lived Deepgram tokens for paid users
- `lib/transcription/__tests__/hardwareProbe.test.ts`
- `lib/transcription/__tests__/strategy.test.ts`
- `lib/transcription/__tests__/adaptiveMonitor.test.ts`
- `lib/transcription/__tests__/reTranscription.test.ts`
- `lib/transcription/__tests__/webSpeechAdapter.test.ts`

**Modified:**
- `lib/db.ts` — Dexie schema bump; `ingestTranscript()` gains `language` and `tier` fields
- `lib/hooks/useLocalTranscriptionBroadcaster.ts` — re-exports from new hook (back-compat alias) then later deleted
- `lib/meetingComponents/VideoConference.tsx` — switch import to new hook
- `app/recordings/[id]/RecordingDetailClient.tsx` — add "Improve transcript quality" button
- `lib/test/TestHarnessPanel.tsx` — add "Test transcription tiers" button
- `app/settings/page.tsx` — add transcription quality dropdown

**Deleted at the end:**
- `lib/hooks/useLocalTranscriptionBroadcaster.ts` (after consumers migrated)

---

## Task 1: Shared types and adapter contract

**Files:**
- Create: `lib/transcription/types.ts`

- [ ] **Step 1: Write the type definitions**

```ts
// lib/transcription/types.ts
/**
 * Shared types for the transcription subsystem. The TranscriberAdapter
 * interface is the contract every tier (Cloud / Local Whisper / Web
 * Speech) implements, so the strategy selector can swap them without
 * the caller knowing which tier is active.
 */

export type Tier = 'cloud' | 'local-whisper' | 'web-speech';

export type WhisperModel = 'whisper-tiny' | 'whisper-base';

export interface TranscriptionEvent {
    /** LiveKit local participant identity. Diarization is free here. */
    speaker: string;
    text: string;
    isFinal: boolean;
    /** BCP-47 tag (e.g. "en-US", "es-ES"); null when unknown. */
    language: string | null;
    tier: Tier;
    /** Date.now() at adapter emission. */
    timestamp: number;
}

export type TranscriptionListener = (event: TranscriptionEvent) => void;

export interface TranscriberAdapter {
    readonly tier: Tier;
    readonly model?: WhisperModel | string;

    /**
     * Begin transcribing audio from the given MediaStream. Idempotent:
     * calling start() on an already-started adapter must be a no-op.
     */
    start(audioStream: MediaStream, speaker: string): Promise<void>;

    /**
     * Stop transcribing and release resources. Idempotent.
     */
    stop(): Promise<void>;

    /**
     * Subscribe to transcript events. Returns an unsubscribe function.
     * Multiple listeners are supported.
     */
    onTranscript(listener: TranscriptionListener): () => void;
}

/**
 * Result of TranscriptionStrategySelector.select(). The "source" field
 * is for telemetry/debugging — tells the caller why this tier was
 * picked.
 */
export interface StrategyResult {
    tier: Tier;
    model?: WhisperModel;
    source: 'cache' | 'static-probe' | 'benchmark' | 'user-override' | 'paid-cloud-pref';
    reasoning: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/transcription/types.ts
git commit -m "transcription: add shared types and adapter contract"
```

---

## Task 2: `isPaidUser()` subscription stub

**Files:**
- Create: `lib/auth/subscription.ts`
- Test: `lib/auth/__tests__/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/__tests__/subscription.test.ts
import { describe, it, expect } from 'vitest';
import { isPaidUser } from '../subscription';

describe('isPaidUser', () => {
    it('returns false in v1 (no payment system yet)', () => {
        expect(isPaidUser()).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest lib/auth/__tests__/subscription.test.ts -t "isPaidUser"`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the stub**

```ts
// lib/auth/subscription.ts
/**
 * Returns true if the current user has a paid subscription that grants
 * access to cloud features (Tier 1 STT, re-transcription).
 *
 * This is a v1 stub that returns false unconditionally. Problem #5
 * (Stripe + Appwrite subscription system) will replace this with a
 * real check against Appwrite subscription state. Single chokepoint by
 * design — swap is one file.
 */
export function isPaidUser(): boolean {
    return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest lib/auth/__tests__/subscription.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/auth/
git commit -m "auth: add isPaidUser() stub for transcription tier gating"
```

---

## Task 3: Hardware probe (static)

**Files:**
- Create: `lib/transcription/hardwareProbe.ts`
- Test: `lib/transcription/__tests__/hardwareProbe.test.ts`

- [ ] **Step 1: Write failing tests for the probe**

```ts
// lib/transcription/__tests__/hardwareProbe.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeHardware } from '../hardwareProbe';

const setNavigator = (overrides: Partial<Record<string, unknown>>) => {
    for (const [key, value] of Object.entries(overrides)) {
        Object.defineProperty(globalThis.navigator, key, {
            value,
            configurable: true,
            writable: true,
        });
    }
};

describe('probeHardware', () => {
    let original: Record<string, PropertyDescriptor | undefined>;

    beforeEach(() => {
        original = {
            gpu: Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu'),
            hardwareConcurrency: Object.getOwnPropertyDescriptor(globalThis.navigator, 'hardwareConcurrency'),
            deviceMemory: Object.getOwnPropertyDescriptor(globalThis.navigator, 'deviceMemory'),
            userAgent: Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent'),
        };
    });

    afterEach(() => {
        for (const [key, desc] of Object.entries(original)) {
            if (desc) Object.defineProperty(globalThis.navigator, key, desc);
        }
    });

    it('recommends whisper-base for desktop with WebGPU + 8 cores + 8GB', () => {
        setNavigator({
            gpu: {} as GPU,
            hardwareConcurrency: 8,
            deviceMemory: 8,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-2');
        expect(result.recommendedModel).toBe('whisper-base');
    });

    it('recommends whisper-tiny for mobile with WebGPU', () => {
        setNavigator({
            gpu: {} as GPU,
            hardwareConcurrency: 6,
            deviceMemory: 4,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-2');
        expect(result.recommendedModel).toBe('whisper-tiny');
    });

    it('returns borderline for desktop without WebGPU but 8+ cores', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: 8,
            deviceMemory: 8,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        });
        const result = probeHardware();
        expect(result.category).toBe('borderline');
    });

    it('returns definitely-tier-3 for low-spec mobile without WebGPU', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: 4,
            deviceMemory: 2,
            userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-A105F)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-3');
    });

    it('defaults to definitely-tier-3 when navigator APIs are missing', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: undefined,
            deviceMemory: undefined,
            userAgent: 'unknown',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-3');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest lib/transcription/__tests__/hardwareProbe.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the probe**

```ts
// lib/transcription/hardwareProbe.ts
import type { WhisperModel } from './types';

/**
 * Static hardware probe — millisecond-fast, no model download.
 *
 * Decision rules (informed by published benchmarks of transformers.js
 * + Whisper, mid-2025):
 *   - WebGPU + desktop + ≥8 cores + ≥4GB RAM → whisper-base, real-time
 *   - WebGPU + (mobile OR <8 cores OR <4GB) → whisper-tiny, real-time
 *   - No WebGPU + ≥8 cores + ≥4GB + desktop → borderline (run benchmark)
 *   - everything else → tier 3 (Web Speech)
 */

export interface HardwareProbeResult {
    category: 'definitely-tier-2' | 'borderline' | 'definitely-tier-3';
    recommendedModel?: WhisperModel;
    reasoning: string;
    /** Stable hash of the inputs — useful as cache key. */
    fingerprint: string;
}

const isMobileUa = (ua: string): boolean =>
    /iPhone|iPad|iPod|Android|Mobile/i.test(ua);

const safeGet = <T>(fn: () => T, fallback: T): T => {
    try {
        return fn() ?? fallback;
    } catch {
        return fallback;
    }
};

export function probeHardware(): HardwareProbeResult {
    const hasWebGPU = safeGet(() => Boolean((navigator as any).gpu), false);
    const cores = safeGet(() => navigator.hardwareConcurrency, 0);
    const ram = safeGet(() => (navigator as any).deviceMemory as number, 0);
    const ua = safeGet(() => navigator.userAgent, 'unknown');
    const mobile = isMobileUa(ua);

    const fingerprint = `${hasWebGPU ? 'gpu' : 'no-gpu'}|c${cores}|m${ram}|${mobile ? 'mob' : 'dsk'}`;

    if (hasWebGPU) {
        if (!mobile && cores >= 8 && ram >= 4) {
            return {
                category: 'definitely-tier-2',
                recommendedModel: 'whisper-base',
                reasoning: 'WebGPU + desktop + 8+ cores + 4GB+ RAM → whisper-base real-time',
                fingerprint,
            };
        }
        return {
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-tiny',
            reasoning: 'WebGPU available but mobile or constrained → whisper-tiny',
            fingerprint,
        };
    }

    // No WebGPU
    if (!mobile && cores >= 8 && ram >= 4) {
        return {
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: 'No WebGPU but capable CPU desktop — benchmark to confirm',
            fingerprint,
        };
    }

    return {
        category: 'definitely-tier-3',
        reasoning: hasWebGPU
            ? 'WebGPU present but mobile/constrained — Tier 3 fallback'
            : `No WebGPU + ${mobile ? 'mobile' : 'low-spec desktop'} (${cores} cores, ${ram}GB) → Tier 3`,
        fingerprint,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest lib/transcription/__tests__/hardwareProbe.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/transcription/hardwareProbe.ts lib/transcription/__tests__/hardwareProbe.test.ts
git commit -m "transcription: add static hardware probe for tier selection"
```

---

## Task 4: Adaptive monitor (runtime buffer-lag watcher)

**Files:**
- Create: `lib/transcription/adaptiveMonitor.ts`
- Test: `lib/transcription/__tests__/adaptiveMonitor.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/transcription/__tests__/adaptiveMonitor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdaptiveMonitor } from '../adaptiveMonitor';

describe('AdaptiveMonitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('does not fire demotion when buffer stays under threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote });
        m.start();
        // 4s of audio queued, 4s transcribed → 0s lag
        m.recordAudio(4);
        m.recordTranscribed(4);
        vi.advanceTimersByTime(3000);
        expect(onDemote).not.toHaveBeenCalled();
        m.stop();
    });

    it('fires demotion after 3 consecutive lag samples above threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        // Each tick: audio grows by 10s, transcribed grows by 1s → 9s lag (above threshold)
        for (let i = 0; i < 3; i++) {
            m.recordAudio(10);
            m.recordTranscribed(1);
            vi.advanceTimersByTime(1000);
        }
        expect(onDemote).toHaveBeenCalledTimes(1);
        m.stop();
    });

    it('resets counter when a sample comes back under threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        // Two laggy samples...
        m.recordAudio(10); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        m.recordAudio(10); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        // ...then a recovery
        m.recordAudio(11); m.recordTranscribed(11);
        vi.advanceTimersByTime(1000);
        // Two more laggy samples — should not fire because counter reset
        m.recordAudio(11); m.recordTranscribed(2);
        vi.advanceTimersByTime(1000);
        m.recordAudio(11); m.recordTranscribed(2);
        vi.advanceTimersByTime(1000);
        expect(onDemote).not.toHaveBeenCalled();
        m.stop();
    });

    it('only fires once per session even if lag persists', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        for (let i = 0; i < 10; i++) {
            m.recordAudio(10);
            m.recordTranscribed(1);
            vi.advanceTimersByTime(1000);
        }
        expect(onDemote).toHaveBeenCalledTimes(1);
        m.stop();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest lib/transcription/__tests__/adaptiveMonitor.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement the monitor**

```ts
// lib/transcription/adaptiveMonitor.ts
/**
 * AdaptiveMonitor — watches the gap between captured audio and
 * transcribed audio during a meeting. If transcription falls behind
 * by `thresholdSec` for `consecutive` consecutive samples, fires
 * onDemote so the strategy selector can swap to a lower-cost tier.
 *
 * Fires at most once per session. If the user manually re-promotes
 * tiers via settings, a new monitor instance is created — the
 * one-shot semantics are intentional to avoid demotion churn.
 */

export interface AdaptiveMonitorOptions {
    /** Lag threshold in seconds. Default 5. */
    thresholdSec?: number;
    /** Number of consecutive laggy samples required to fire. Default 3. */
    consecutive?: number;
    /** How often to evaluate the lag in ms. Default 2000. */
    checkIntervalMs?: number;
    /** Called once when demotion criteria met. */
    onDemote: (info: { lagSec: number; samples: number }) => void;
}

export class AdaptiveMonitor {
    private opts: Required<Omit<AdaptiveMonitorOptions, 'onDemote'>> & Pick<AdaptiveMonitorOptions, 'onDemote'>;
    private audioSec = 0;
    private transcribedSec = 0;
    private consecutiveLaggy = 0;
    private fired = false;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(options: AdaptiveMonitorOptions) {
        this.opts = {
            thresholdSec: options.thresholdSec ?? 5,
            consecutive: options.consecutive ?? 3,
            checkIntervalMs: options.checkIntervalMs ?? 2000,
            onDemote: options.onDemote,
        };
    }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), this.opts.checkIntervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Adds N seconds of audio captured since last call. */
    recordAudio(seconds: number): void {
        this.audioSec += seconds;
    }

    /** Adds N seconds of audio confirmed transcribed since last call. */
    recordTranscribed(seconds: number): void {
        this.transcribedSec += seconds;
    }

    private tick(): void {
        if (this.fired) return;
        const lag = this.audioSec - this.transcribedSec;
        if (lag >= this.opts.thresholdSec) {
            this.consecutiveLaggy++;
            if (this.consecutiveLaggy >= this.opts.consecutive) {
                this.fired = true;
                this.opts.onDemote({ lagSec: lag, samples: this.consecutiveLaggy });
            }
        } else {
            this.consecutiveLaggy = 0;
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest lib/transcription/__tests__/adaptiveMonitor.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add lib/transcription/adaptiveMonitor.ts lib/transcription/__tests__/adaptiveMonitor.test.ts
git commit -m "transcription: add AdaptiveMonitor for runtime tier demotion"
```

---

## Task 5: Web Speech adapter (refactor of current logic)

**Files:**
- Create: `lib/transcription/adapters/webSpeechAdapter.ts`
- Test: `lib/transcription/__tests__/webSpeechAdapter.test.ts`

This refactors the current `useLocalTranscriptionBroadcaster.ts` logic into the adapter shape **without behavior change**. Goal: parity, then swap-in.

- [ ] **Step 1: Write failing test (uses a mock SpeechRecognition)**

```ts
// lib/transcription/__tests__/webSpeechAdapter.test.ts
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
    start = vi.fn(() => { this.started = true; });
    stop = vi.fn(() => { this.started = false; this.onend?.(); });
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
        (globalThis as any).SpeechRecognition = vi.fn(() => mockRec);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest lib/transcription/__tests__/webSpeechAdapter.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement the adapter**

```ts
// lib/transcription/adapters/webSpeechAdapter.ts
import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
} from '../types';

/**
 * WebSpeechAdapter — Tier 3 fallback. Wraps the browser-native
 * SpeechRecognition API. Single-language at a time; the language tag
 * comes from `navigator.language` by default.
 *
 * Refactor of the current useLocalTranscriptionBroadcaster.ts logic.
 * Behavior preserved: continuous=false, interimResults=true,
 * auto-restart on `onend`.
 */

export interface WebSpeechAdapterOptions {
    /** BCP-47 language tag, e.g. "en-US". Default: navigator.language or "en-US". */
    language?: string;
}

export class WebSpeechAdapter implements TranscriberAdapter {
    readonly tier = 'web-speech' as const;
    readonly model = 'webkitSpeechRecognition';

    private recognition: any = null;
    private listeners = new Set<TranscriptionListener>();
    private isCleanedUp = false;
    private speaker = '';
    private language: string;

    constructor(opts: WebSpeechAdapterOptions = {}) {
        this.language =
            opts.language ??
            (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    }

    async start(_audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.recognition) return;
        this.speaker = speaker;
        this.isCleanedUp = false;

        const Ctor =
            (globalThis as any).SpeechRecognition ||
            (globalThis as any).webkitSpeechRecognition;
        if (!Ctor) {
            throw new Error('SpeechRecognition API not available in this browser');
        }

        const r = new Ctor();
        r.continuous = false;
        r.interimResults = true;
        r.lang = this.language;

        r.onresult = (event: any) => {
            if (this.isCleanedUp) return;
            let fullTranscript = '';
            let anyFinal = false;
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
                if (event.results[i].isFinal) anyFinal = true;
            }
            this.emit({
                speaker: this.speaker,
                text: fullTranscript,
                isFinal: anyFinal,
                language: this.language,
                tier: 'web-speech',
                timestamp: Date.now(),
            });
        };

        r.onerror = (event: any) => {
            console.error('[WebSpeechAdapter] error', event.error);
        };

        r.onend = () => {
            if (this.isCleanedUp) return;
            try {
                r.start();
            } catch (e) {
                console.error('[WebSpeechAdapter] failed to restart', e);
            }
        };

        try {
            r.start();
            this.recognition = r;
        } catch (e) {
            console.error('[WebSpeechAdapter] failed to start', e);
            throw e;
        }
    }

    async stop(): Promise<void> {
        this.isCleanedUp = true;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.warn('[WebSpeechAdapter] stop error (benign)', e);
            }
            this.recognition = null;
        }
    }

    onTranscript(listener: TranscriptionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: TranscriptionEvent): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.warn('[WebSpeechAdapter] listener threw', err);
            }
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest lib/transcription/__tests__/webSpeechAdapter.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/transcription/adapters/webSpeechAdapter.ts lib/transcription/__tests__/webSpeechAdapter.test.ts
git commit -m "transcription: refactor Web Speech logic into adapter shape"
```

---

## Task 6: Local Whisper adapter (Tier 2)

**Files:**
- Create: `lib/transcription/adapters/whisperLocalAdapter.ts`

This adapter uses `@westenets/dvai-bridge-core` with the
`automatic-speech-recognition` pipeline task. Audio is chunked from the
input MediaStream using a simple RMS-based VAD (silence-detection)
chunker, then each chunk is fed to Whisper via `runPipeline()`.

This adapter has fewer pure unit tests because the real behavior is
hardware-dependent. Coverage comes from integration tests later
(TestHarnessPanel) and manual QA. We do unit-test the chunker.

- [ ] **Step 1: Implement an RMS-based audio chunker**

Create `lib/transcription/audioChunker.ts`:

```ts
// lib/transcription/audioChunker.ts
/**
 * AudioChunker — slices a MediaStream into utterance-sized PCM chunks
 * suitable for Whisper. Uses a simple RMS-energy threshold to detect
 * silence and chunk on it. Whisper can handle 1–30s clips well; we
 * aim for 3–10s with a hard maximum of 15s to bound latency.
 *
 * This is intentionally simple. A future task can swap in Silero VAD
 * via transformers.js for better accuracy without changing the
 * consumer interface.
 */

export interface AudioChunkerOptions {
    /** Min chunk length before forced flush (ms). Default 1000. */
    minChunkMs?: number;
    /** Max chunk length before forced flush (ms). Default 15000. */
    maxChunkMs?: number;
    /** Silence duration that closes a chunk (ms). Default 600. */
    silenceMs?: number;
    /** RMS amplitude considered silence (0..1). Default 0.01. */
    silenceThreshold?: number;
    /** Sample rate Whisper expects. Default 16000. */
    targetSampleRate?: number;
}

export type AudioChunk = Float32Array;

export class AudioChunker {
    private opts: Required<AudioChunkerOptions>;
    private ctx: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private worklet: AudioWorkletNode | ScriptProcessorNode | null = null;
    private buffer: number[] = [];
    private silentRunMs = 0;
    private chunkStartMs = 0;
    private listeners = new Set<(chunk: AudioChunk) => void>();
    private running = false;

    constructor(options: AudioChunkerOptions = {}) {
        this.opts = {
            minChunkMs: options.minChunkMs ?? 1000,
            maxChunkMs: options.maxChunkMs ?? 15000,
            silenceMs: options.silenceMs ?? 600,
            silenceThreshold: options.silenceThreshold ?? 0.01,
            targetSampleRate: options.targetSampleRate ?? 16000,
        };
    }

    async start(stream: MediaStream): Promise<void> {
        if (this.running) return;
        this.running = true;
        this.ctx = new AudioContext({ sampleRate: this.opts.targetSampleRate });
        this.source = this.ctx.createMediaStreamSource(stream);

        // ScriptProcessorNode is deprecated but ubiquitous; we use it
        // for v1 portability. AudioWorklet upgrade is a follow-up.
        const proc = (this.ctx as any).createScriptProcessor(4096, 1, 1);
        this.worklet = proc;
        const sampleMs = (4096 / this.ctx.sampleRate) * 1000;

        proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (!this.running) return;
            const ch = e.inputBuffer.getChannelData(0);
            // Compute RMS
            let sumSq = 0;
            for (let i = 0; i < ch.length; i++) sumSq += ch[i] * ch[i];
            const rms = Math.sqrt(sumSq / ch.length);

            // Append to buffer
            for (let i = 0; i < ch.length; i++) this.buffer.push(ch[i]);

            const elapsedMs = (this.buffer.length / this.ctx!.sampleRate) * 1000;
            if (this.chunkStartMs === 0) this.chunkStartMs = Date.now();

            if (rms < this.opts.silenceThreshold) {
                this.silentRunMs += sampleMs;
            } else {
                this.silentRunMs = 0;
            }

            const closeOnSilence =
                elapsedMs >= this.opts.minChunkMs &&
                this.silentRunMs >= this.opts.silenceMs;
            const closeOnMax = elapsedMs >= this.opts.maxChunkMs;

            if (closeOnSilence || closeOnMax) {
                this.flush();
            }
        };

        this.source.connect(proc);
        proc.connect(this.ctx.destination);
    }

    private flush(): void {
        if (this.buffer.length === 0) return;
        const chunk = new Float32Array(this.buffer);
        this.buffer = [];
        this.silentRunMs = 0;
        this.chunkStartMs = 0;
        for (const cb of this.listeners) {
            try {
                cb(chunk);
            } catch (e) {
                console.warn('[AudioChunker] listener threw', e);
            }
        }
    }

    onChunk(cb: (chunk: AudioChunk) => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    async stop(): Promise<void> {
        this.running = false;
        this.flush();
        if (this.worklet) {
            try {
                (this.worklet as any).disconnect();
            } catch {}
            this.worklet = null;
        }
        if (this.source) {
            try {
                this.source.disconnect();
            } catch {}
            this.source = null;
        }
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch {}
            this.ctx = null;
        }
    }
}
```

- [ ] **Step 2: Implement WhisperLocalAdapter**

```ts
// lib/transcription/adapters/whisperLocalAdapter.ts
import { DVAI } from '@westenets/dvai-bridge-core';
import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
    WhisperModel,
} from '../types';
import { AudioChunker } from '../audioChunker';

/**
 * WhisperLocalAdapter — Tier 2. Runs Whisper-tiny or whisper-base in
 * a Web Worker via @westenets/dvai-bridge-core. Native multilingual,
 * auto-detects language per chunk, includes punctuation. Worker-thread
 * means no main-thread blocking.
 */

export interface WhisperLocalAdapterOptions {
    model?: WhisperModel;
    /** Chunker tuning. */
    chunker?: ConstructorParameters<typeof AudioChunker>[0];
}

const HF_MODEL_IDS: Record<WhisperModel, string> = {
    'whisper-tiny': 'Xenova/whisper-tiny',
    'whisper-base': 'Xenova/whisper-base',
};

export class WhisperLocalAdapter implements TranscriberAdapter {
    readonly tier = 'local-whisper' as const;
    readonly model: WhisperModel;

    private dvai: DVAI | null = null;
    private chunker: AudioChunker | null = null;
    private listeners = new Set<TranscriptionListener>();
    private speaker = '';
    private chunkerOpts: ConstructorParameters<typeof AudioChunker>[0];

    constructor(opts: WhisperLocalAdapterOptions = {}) {
        this.model = opts.model ?? 'whisper-tiny';
        this.chunkerOpts = opts.chunker ?? {};
    }

    async start(audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.dvai) return;
        this.speaker = speaker;

        this.dvai = new DVAI({
            backend: 'transformers',
            transformersModelId: HF_MODEL_IDS[this.model],
            pipelineTask: 'automatic-speech-recognition',
            transport: 'none',
            // Default worker URL — runs Whisper in a Web Worker.
        });
        await this.dvai.initialize();

        this.chunker = new AudioChunker(this.chunkerOpts);
        this.chunker.onChunk(async (chunk) => {
            const ai = this.dvai;
            if (!ai) return;
            try {
                const out = await ai.runPipeline(chunk, {
                    language: undefined, // auto-detect per chunk
                    return_timestamps: false,
                });
                const text = this.extractText(out);
                const lang = this.extractLanguage(out);
                if (text.trim().length === 0) return;
                this.emit({
                    speaker: this.speaker,
                    text,
                    isFinal: true,
                    language: lang,
                    tier: 'local-whisper',
                    timestamp: Date.now(),
                });
            } catch (err) {
                console.warn('[WhisperLocalAdapter] inference error', err);
            }
        });
        await this.chunker.start(audioStream);
    }

    async stop(): Promise<void> {
        if (this.chunker) {
            await this.chunker.stop();
            this.chunker = null;
        }
        if (this.dvai) {
            await this.dvai.unload();
            this.dvai = null;
        }
    }

    onTranscript(listener: TranscriptionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private extractText(out: any): string {
        if (!out) return '';
        if (typeof out === 'string') return out;
        if (typeof out.text === 'string') return out.text;
        if (Array.isArray(out) && out[0]?.text) return out[0].text;
        return '';
    }

    private extractLanguage(out: any): string | null {
        if (!out) return null;
        if (typeof out.language === 'string') return out.language;
        if (Array.isArray(out) && out[0]?.language) return out[0].language;
        return null;
    }

    private emit(event: TranscriptionEvent): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.warn('[WhisperLocalAdapter] listener threw', err);
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/transcription/audioChunker.ts lib/transcription/adapters/whisperLocalAdapter.ts
git commit -m "transcription: add WhisperLocalAdapter (Tier 2) and audio chunker"
```

---

## Task 7: Cloud STT adapter (Deepgram, Tier 1)

**Files:**
- Create: `lib/transcription/adapters/cloudSttAdapter.ts`
- Create: `app/api/transcription/cloud-token/route.ts`

The cloud adapter needs server-side help: the Deepgram API key must
NEVER ship to the client. The client calls our `/api/transcription/cloud-token`
endpoint, which (after verifying the user is paid) returns a
short-lived Deepgram temporary token. The client uses that to open the
WebSocket directly.

- [ ] **Step 1: Create the cloud-token route handler**

```ts
// app/api/transcription/cloud-token/route.ts
import { NextResponse } from 'next/server';
import { isPaidUser } from '@/lib/auth/subscription';

/**
 * Returns a short-lived Deepgram API token for paid users.
 *
 * For v1 (this spec), isPaidUser() is a stub that returns false, so
 * this endpoint always 402s. Problem #5 wires up the real check.
 *
 * In production, swap the static API key flow for Deepgram's
 * "Generate Temporary API Key" endpoint:
 *   https://developers.deepgram.com/docs/manage-keys#create-key
 * which returns a TTL-bound token suitable for client use.
 */

export async function POST(_req: Request) {
    if (!isPaidUser()) {
        return NextResponse.json(
            { error: 'Cloud transcription requires a paid plan.' },
            { status: 402 },
        );
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: 'Cloud STT not configured on this server.' },
            { status: 503 },
        );
    }

    // TODO (problem #5): swap for Deepgram temporary-key API. For now
    // we return the static key — only works for paid users (gated above)
    // and the route requires session auth in production.
    return NextResponse.json({
        token: apiKey,
        // Endpoint hint for the client; multiplexed model selection.
        baseUrl: 'wss://api.deepgram.com/v1/listen',
    });
}
```

- [ ] **Step 2: Implement the Cloud STT adapter**

```ts
// lib/transcription/adapters/cloudSttAdapter.ts
import type {
    TranscriberAdapter,
    TranscriptionEvent,
    TranscriptionListener,
} from '../types';

/**
 * CloudSttAdapter — Tier 1. Streams mic audio to Deepgram Nova-3 over
 * WebSocket. Native multilingual + code-switching + punctuation.
 *
 * Auth: fetched from /api/transcription/cloud-token, which gates on
 * isPaidUser(). Connection is direct from browser → Deepgram (no
 * audio proxying through our servers, lowest latency).
 *
 * Reconnect: 3 retries with exponential backoff on disconnect.
 */

export interface CloudSttAdapterOptions {
    tokenEndpoint?: string;
    /** Deepgram model. Default 'nova-3' (best multilingual). */
    model?: string;
    /** Enable code-switching detection. Default true. */
    detectLanguage?: boolean;
}

const PCM_CHUNK_MS = 250; // Deepgram recommends 100-250ms chunks
const RECONNECT_DELAYS_MS = [500, 2000, 5000];

export class CloudSttAdapter implements TranscriberAdapter {
    readonly tier = 'cloud' as const;
    readonly model: string;

    private opts: Required<CloudSttAdapterOptions>;
    private ws: WebSocket | null = null;
    private ctx: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private worklet: ScriptProcessorNode | null = null;
    private listeners = new Set<TranscriptionListener>();
    private speaker = '';
    private stream: MediaStream | null = null;
    private cleanedUp = false;
    private reconnectIdx = 0;

    constructor(opts: CloudSttAdapterOptions = {}) {
        this.opts = {
            tokenEndpoint: opts.tokenEndpoint ?? '/api/transcription/cloud-token',
            model: opts.model ?? 'nova-3',
            detectLanguage: opts.detectLanguage ?? true,
        };
        this.model = this.opts.model;
    }

    async start(audioStream: MediaStream, speaker: string): Promise<void> {
        if (this.ws) return;
        this.speaker = speaker;
        this.stream = audioStream;
        this.cleanedUp = false;
        await this.connectAndStream();
    }

    private async connectAndStream(): Promise<void> {
        const tokenRes = await fetch(this.opts.tokenEndpoint, { method: 'POST' });
        if (!tokenRes.ok) {
            throw new Error(`Cloud STT auth failed (${tokenRes.status})`);
        }
        const { token, baseUrl } = await tokenRes.json();

        const params = new URLSearchParams({
            model: this.opts.model,
            punctuate: 'true',
            interim_results: 'true',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
        });
        if (this.opts.detectLanguage) params.set('detect_language', 'true');

        this.ws = new WebSocket(`${baseUrl}?${params.toString()}`, [
            'token',
            token,
        ]);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => this.beginPcmPump();
        this.ws.onmessage = (e) => this.handleMessage(e);
        this.ws.onerror = (e) => console.warn('[CloudSttAdapter] ws error', e);
        this.ws.onclose = () => this.handleDisconnect();
    }

    private beginPcmPump(): void {
        if (!this.stream) return;
        this.ctx = new AudioContext({ sampleRate: 16000 });
        this.source = this.ctx.createMediaStreamSource(this.stream);
        const bufferSize = Math.max(
            256,
            Math.round((PCM_CHUNK_MS / 1000) * this.ctx.sampleRate),
        );
        const proc = (this.ctx as any).createScriptProcessor(bufferSize, 1, 1);
        this.worklet = proc;
        proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (this.cleanedUp || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const ch = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(ch.length);
            for (let i = 0; i < ch.length; i++) {
                const s = Math.max(-1, Math.min(1, ch[i]));
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            this.ws.send(pcm.buffer);
        };
        this.source.connect(proc);
        proc.connect(this.ctx.destination);
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);
            const channel = data.channel;
            if (!channel) return;
            const alt = channel.alternatives?.[0];
            if (!alt) return;
            const text: string = alt.transcript ?? '';
            if (!text || text.trim().length === 0) return;
            const isFinal = !!data.is_final;
            const language: string | null =
                data.detected_language ?? data.language ?? null;
            this.emit({
                speaker: this.speaker,
                text,
                isFinal,
                language,
                tier: 'cloud',
                timestamp: Date.now(),
            });
        } catch (err) {
            console.warn('[CloudSttAdapter] failed to parse msg', err);
        }
    }

    private handleDisconnect(): void {
        if (this.cleanedUp) return;
        if (this.reconnectIdx >= RECONNECT_DELAYS_MS.length) {
            console.warn('[CloudSttAdapter] giving up after retries');
            return;
        }
        const delay = RECONNECT_DELAYS_MS[this.reconnectIdx++];
        console.warn(`[CloudSttAdapter] reconnecting in ${delay}ms`);
        setTimeout(() => {
            if (!this.cleanedUp) {
                this.connectAndStream().catch((err) => {
                    console.error('[CloudSttAdapter] reconnect failed', err);
                });
            }
        }, delay);
    }

    async stop(): Promise<void> {
        this.cleanedUp = true;
        try {
            this.worklet?.disconnect();
        } catch {}
        try {
            this.source?.disconnect();
        } catch {}
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch {}
            this.ctx = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }
    }

    onTranscript(listener: TranscriptionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: TranscriptionEvent): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.warn('[CloudSttAdapter] listener threw', err);
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/transcription/adapters/cloudSttAdapter.ts app/api/transcription/cloud-token/route.ts
git commit -m "transcription: add CloudSttAdapter (Tier 1, Deepgram) + token endpoint"
```

---

## Task 8: Capability benchmark (lazy)

**Files:**
- Create: `lib/transcription/benchmark.ts`

The benchmark is intentionally simple: load whisper-tiny once, run a
synthetic 5s audio clip, measure how long it takes. If under real-time,
Tier 2 is viable. The synthetic audio is silent — Whisper processes
silence quickly enough to give us a useful "model load + inference"
baseline without needing real audio.

- [ ] **Step 1: Implement the benchmark**

```ts
// lib/transcription/benchmark.ts
import { DVAI } from '@westenets/dvai-bridge-core';
import type { Tier, WhisperModel } from './types';

export interface BenchmarkResult {
    realtimeFactor: number;  // 1.0 = realtime; >1.0 = faster than realtime
    recommendedTier: Tier;
    recommendedModel?: WhisperModel;
    inferenceMs: number;
    audioLengthMs: number;
}

const SAMPLE_RATE = 16000;
const BENCHMARK_AUDIO_MS = 5000;

let cachedResult: BenchmarkResult | null = null;
let inFlight: Promise<BenchmarkResult> | null = null;

/**
 * Runs a one-shot whisper-tiny benchmark to determine if Tier 2 is
 * viable on this device. Memoized — the benchmark runs at most once
 * per page session. The result is also persisted to localStorage by
 * the strategy selector.
 */
export async function runCapabilityBenchmark(): Promise<BenchmarkResult> {
    if (cachedResult) return cachedResult;
    if (inFlight) return inFlight;
    inFlight = doBenchmark();
    try {
        cachedResult = await inFlight;
        return cachedResult;
    } finally {
        inFlight = null;
    }
}

async function doBenchmark(): Promise<BenchmarkResult> {
    const dvai = new DVAI({
        backend: 'transformers',
        transformersModelId: 'Xenova/whisper-tiny',
        pipelineTask: 'automatic-speech-recognition',
        transport: 'none',
    });

    try {
        await dvai.initialize();
        // Synthetic 5s of silence at 16kHz mono.
        const samples = new Float32Array(SAMPLE_RATE * (BENCHMARK_AUDIO_MS / 1000));

        const t0 = performance.now();
        await dvai.runPipeline(samples);
        const inferenceMs = performance.now() - t0;

        const realtimeFactor = BENCHMARK_AUDIO_MS / inferenceMs;
        const passed = realtimeFactor >= 1.5; // 50% headroom over real-time

        return {
            realtimeFactor,
            recommendedTier: passed ? 'local-whisper' : 'web-speech',
            recommendedModel: passed ? 'whisper-tiny' : undefined,
            inferenceMs,
            audioLengthMs: BENCHMARK_AUDIO_MS,
        };
    } finally {
        try {
            await dvai.unload();
        } catch (err) {
            console.warn('[benchmark] unload failed', err);
        }
    }
}

/** Test seam: clear the in-process cache. */
export function _resetBenchmarkCache(): void {
    cachedResult = null;
    inFlight = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/transcription/benchmark.ts
git commit -m "transcription: add lazy whisper-tiny capability benchmark"
```

---

## Task 9: Strategy selector

**Files:**
- Create: `lib/transcription/strategy.ts`
- Test: `lib/transcription/__tests__/strategy.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/transcription/__tests__/strategy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectStrategy, _resetStrategyCache, type UserPreference } from '../strategy';

vi.mock('../hardwareProbe', () => ({
    probeHardware: vi.fn(),
}));
vi.mock('../benchmark', () => ({
    runCapabilityBenchmark: vi.fn(),
}));
vi.mock('@/lib/auth/subscription', () => ({
    isPaidUser: vi.fn(),
}));

import { probeHardware } from '../hardwareProbe';
import { runCapabilityBenchmark } from '../benchmark';
import { isPaidUser } from '@/lib/auth/subscription';

describe('selectStrategy', () => {
    beforeEach(() => {
        _resetStrategyCache();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('returns Tier 2 with whisper-base when probe says definitely-tier-2 (no benchmark)', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: 'webgpu desktop',
            fingerprint: 'a',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('local-whisper');
        expect(result.model).toBe('whisper-base');
        expect(result.source).toBe('static-probe');
        expect(runCapabilityBenchmark).not.toHaveBeenCalled();
    });

    it('returns Tier 3 directly when probe says definitely-tier-3 (no benchmark download)', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-3',
            reasoning: 'low spec',
            fingerprint: 'b',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('web-speech');
        expect(result.source).toBe('static-probe');
        expect(runCapabilityBenchmark).not.toHaveBeenCalled();
    });

    it('runs benchmark when probe is borderline', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: 'cpu only desktop',
            fingerprint: 'c',
        });
        (isPaidUser as any).mockReturnValue(false);
        (runCapabilityBenchmark as any).mockResolvedValue({
            realtimeFactor: 2.0,
            recommendedTier: 'local-whisper',
            recommendedModel: 'whisper-tiny',
            inferenceMs: 2500,
            audioLengthMs: 5000,
        });
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('local-whisper');
        expect(result.source).toBe('benchmark');
    });

    it('falls back to Tier 3 when benchmark fails the realtime test', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: '',
            fingerprint: 'd',
        });
        (isPaidUser as any).mockReturnValue(false);
        (runCapabilityBenchmark as any).mockResolvedValue({
            realtimeFactor: 0.5,
            recommendedTier: 'web-speech',
            inferenceMs: 10000,
            audioLengthMs: 5000,
        });
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('web-speech');
    });

    it('refuses Tier 1 (cloud) when isPaidUser is false', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'e',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'cloud' });
        expect(result.tier).toBe('local-whisper');
        // Note source: user wanted cloud but didn't get it
        expect(result.reasoning).toMatch(/paid/i);
    });

    it('honors Tier 1 (cloud) when isPaidUser is true', async () => {
        (isPaidUser as any).mockReturnValue(true);
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'f',
        });
        const result = await selectStrategy({ pref: 'cloud' });
        expect(result.tier).toBe('cloud');
        expect(result.source).toBe('paid-cloud-pref');
    });

    it('honors user override "basic" → Tier 3 regardless of hardware', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'g',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'basic' });
        expect(result.tier).toBe('web-speech');
        expect(result.source).toBe('user-override');
    });

    it('caches result in localStorage and reuses on next call', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'h',
        });
        (isPaidUser as any).mockReturnValue(false);
        await selectStrategy({ pref: 'auto' });
        const second = await selectStrategy({ pref: 'auto' });
        expect(second.source).toBe('cache');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest lib/transcription/__tests__/strategy.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement the selector**

```ts
// lib/transcription/strategy.ts
import { probeHardware } from './hardwareProbe';
import { runCapabilityBenchmark } from './benchmark';
import { isPaidUser } from '@/lib/auth/subscription';
import type { StrategyResult, Tier, WhisperModel } from './types';

export type UserPreference =
    | 'auto'         // hardware probe decides
    | 'local-ai'     // force Tier 2; fall back to Tier 3 if hardware can't
    | 'basic'        // force Tier 3
    | 'cloud';       // request Tier 1 (paid only; falls back if not paid)

export interface SelectStrategyArgs {
    pref: UserPreference;
}

const CACHE_KEY = 'dvai.transcription.strategy.v1';
let inMemoryCache: { fingerprint: string; result: StrategyResult } | null = null;

export async function selectStrategy(args: SelectStrategyArgs): Promise<StrategyResult> {
    const probe = probeHardware();
    const fingerprintKey = `${probe.fingerprint}|pref:${args.pref}|paid:${isPaidUser() ? 1 : 0}`;

    // Cache lookup (memory then localStorage).
    const cached = readCache(fingerprintKey);
    if (cached) return cached;

    const result = await compute(args, probe);
    writeCache(fingerprintKey, result);
    return result;
}

async function compute(
    args: SelectStrategyArgs,
    probe: ReturnType<typeof probeHardware>,
): Promise<StrategyResult> {
    // 1. User override beats everything except invalid combos
    if (args.pref === 'basic') {
        return mk('web-speech', undefined, 'user-override', 'User picked Basic (Web Speech)');
    }
    if (args.pref === 'cloud') {
        if (isPaidUser()) {
            return mk('cloud', undefined, 'paid-cloud-pref', 'User picked Cloud and is on a paid plan');
        }
        return mk(
            probe.category === 'definitely-tier-3' ? 'web-speech' : 'local-whisper',
            probe.recommendedModel,
            'static-probe',
            'User picked Cloud but is not paid; falling back to best free tier',
        );
    }
    if (args.pref === 'local-ai') {
        if (probe.category === 'definitely-tier-3') {
            return mk('web-speech', undefined, 'static-probe',
                'User picked Local AI but hardware cannot run Whisper in real-time');
        }
        return mk('local-whisper', probe.recommendedModel, 'user-override', 'User picked Local AI');
    }

    // 2. Auto path
    if (probe.category === 'definitely-tier-2') {
        return mk('local-whisper', probe.recommendedModel, 'static-probe', probe.reasoning);
    }
    if (probe.category === 'definitely-tier-3') {
        return mk('web-speech', undefined, 'static-probe', probe.reasoning);
    }

    // Borderline → run benchmark
    try {
        const bench = await runCapabilityBenchmark();
        if (bench.recommendedTier === 'local-whisper') {
            return mk(
                'local-whisper',
                bench.recommendedModel,
                'benchmark',
                `Benchmark passed at ${bench.realtimeFactor.toFixed(2)}× real-time`,
            );
        }
        return mk(
            'web-speech',
            undefined,
            'benchmark',
            `Benchmark failed (${bench.realtimeFactor.toFixed(2)}× real-time); using Tier 3`,
        );
    } catch (err) {
        return mk('web-speech', undefined, 'static-probe',
            `Benchmark failed to run; defaulting to Tier 3 (${(err as Error).message})`);
    }
}

function mk(tier: Tier, model: WhisperModel | undefined, source: StrategyResult['source'], reasoning: string): StrategyResult {
    return { tier, model, source, reasoning };
}

function readCache(fpKey: string): StrategyResult | null {
    if (inMemoryCache?.fingerprint === fpKey) {
        return { ...inMemoryCache.result, source: 'cache' };
    }
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.fingerprint === fpKey) {
            inMemoryCache = { fingerprint: fpKey, result: parsed.result };
            return { ...parsed.result, source: 'cache' };
        }
    } catch {
        // Corrupt cache — silently ignore.
    }
    return null;
}

function writeCache(fpKey: string, result: StrategyResult): void {
    inMemoryCache = { fingerprint: fpKey, result };
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fingerprint: fpKey, result }));
    } catch {
        // Quota or denied — non-fatal.
    }
}

/** Test seam. */
export function _resetStrategyCache(): void {
    inMemoryCache = null;
    if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem(CACHE_KEY); } catch {}
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest lib/transcription/__tests__/strategy.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add lib/transcription/strategy.ts lib/transcription/__tests__/strategy.test.ts
git commit -m "transcription: add TranscriptionStrategySelector with cache"
```

---

## Task 10: DB schema migration

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Read current db.ts to understand the schema**

Run: `cat lib/db.ts | head -120`

- [ ] **Step 2: Bump schema version, add language and tier fields**

Locate the Dexie schema definition in `lib/db.ts` and add the new
columns. Increment the version number; add an `.upgrade()` that
backfills `tier: 'web-speech'` and `language: null` for existing rows.

```ts
// Inside lib/db.ts, where the Dexie schema is defined:
// Existing version (illustrative; actual version number will differ):
// this.version(N).stores({ transcripts: '++id, room_name, speaker, text, embedding, ts' });

// Add a new version with the new fields:
this.version(N + 1)
    .stores({
        transcripts:
            '++id, room_name, speaker, text, embedding, ts, language, tier',
    })
    .upgrade(async (tx) => {
        const table = tx.table('transcripts');
        await table.toCollection().modify((row: any) => {
            if (row.language === undefined) row.language = null;
            if (row.tier === undefined) row.tier = 'web-speech';
        });
    });

// Update ingestTranscript() signature to accept the new fields:
export async function ingestTranscript(
    speaker: string,
    text: string,
    roomName: string,
    options: { language?: string | null; tier?: 'web-speech' | 'local-whisper' | 'cloud' | 'cloud-rerun' | 'local-rerun' } = {},
): Promise<void> {
    // existing logic...
    // when inserting, include:
    //   language: options.language ?? null,
    //   tier: options.tier ?? 'web-speech',
}
```

- [ ] **Step 3: Update existing callers of ingestTranscript**

Search for callers and add the optional fields where transcripts come
from a known tier. (`useLocalTranscriptionBroadcaster.ts` will be
removed in a later task; all *new* code goes through the new hook.)
For now, existing callers can stay unchanged — the optional fields
default correctly.

Run: `grep -rn "ingestTranscript" lib/ app/ components/ --include="*.ts" --include="*.tsx"`

For each caller that *knows* the tier (e.g. the new hook coming in
Task 12), pass it. For now, no edits needed — defaults handle it.

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: PASS (Dexie auto-migrates on first run; build doesn't exercise it)

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "db: add language and tier columns to transcripts (Dexie upgrade)"
```

---

## Task 11: Re-transcription service

**Files:**
- Create: `lib/transcription/reTranscription.ts`
- Test: `lib/transcription/__tests__/reTranscription.test.ts`

The alignment logic (matching new transcripts to existing speaker
labels by timestamp) is the only piece worth unit-testing in
isolation. The actual STT call is delegated to one of the existing
adapters.

- [ ] **Step 1: Write the alignment function + test**

Create `lib/transcription/alignmentByTimestamp.ts`:

```ts
// lib/transcription/alignmentByTimestamp.ts
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
```

Test:

```ts
// lib/transcription/__tests__/reTranscription.test.ts
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
            { text: 'hi', language: 'en', timestampMs: 100 },     // → alice
            { text: 'hey', language: 'en', timestampMs: 4900 },   // → bob (4900 closer to 5000 than 0)
            { text: 'k', language: 'en', timestampMs: 9500 },     // → alice (9500 closer to 10000 than 5000)
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
```

- [ ] **Step 2: Run alignment tests, verify pass**

Run: `pnpm vitest lib/transcription/__tests__/reTranscription.test.ts`
Expected: 3 passed

- [ ] **Step 3: Implement the orchestration service**

```ts
// lib/transcription/reTranscription.ts
import { alignByTimestamp, type NewChunk, type ReferenceRow } from './alignmentByTimestamp';
import { isPaidUser } from '@/lib/auth/subscription';
import { db } from '@/lib/db';
import { embedderService } from '@/lib/embedder';
import type { Tier } from './types';

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
 * the rows in Dexie.
 *
 * Embeddings are regenerated for the replaced rows.
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
        // No reference timeline — give up rather than guess speakers.
        throw new Error('No existing transcripts to align against; cannot preserve diarization.');
    }
    const refs: ReferenceRow[] = existingRows.map((r: any) => ({
        speaker: r.speaker,
        timestampMs: r.ts,
    }));

    // 4. Align
    const aligned = alignByTimestamp(newChunks, refs);

    // 5. Replace rows: delete existing, insert aligned with re-embed
    await db.transcripts.where('room_name').equals(opts.roomName).delete();
    for (const a of aligned) {
        const embedding = a.text ? await embedderService.embed(a.text) : new Float32Array(384);
        await db.transcripts.add({
            room_name: opts.roomName,
            speaker: a.speaker,
            text: a.text,
            ts: a.timestampMs,
            embedding,
            language: a.language,
            tier: opts.resultTier,
        } as any);
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/transcription/reTranscription.ts lib/transcription/alignmentByTimestamp.ts lib/transcription/__tests__/reTranscription.test.ts
git commit -m "transcription: add paid re-transcription service with timestamp alignment"
```

---

## Task 12: New `useTranscriptionBroadcaster` hook

**Files:**
- Create: `lib/hooks/useTranscriptionBroadcaster.ts`
- Modify: `lib/hooks/useLocalTranscriptionBroadcaster.ts` (becomes a re-export shim)

- [ ] **Step 1: Write the new hook**

```ts
// lib/hooks/useTranscriptionBroadcaster.ts
import { useEffect, useRef, useState } from 'react';
import {
    useRoomContext,
    useLocalParticipant,
    useRemoteParticipants,
} from '@livekit/components-react';
import toast from 'react-hot-toast';
import { ingestTranscript } from '../db';
import { selectStrategy, type UserPreference } from '../transcription/strategy';
import { AdaptiveMonitor } from '../transcription/adaptiveMonitor';
import { WebSpeechAdapter } from '../transcription/adapters/webSpeechAdapter';
import { WhisperLocalAdapter } from '../transcription/adapters/whisperLocalAdapter';
import { CloudSttAdapter } from '../transcription/adapters/cloudSttAdapter';
import type { TranscriberAdapter, Tier } from '../transcription/types';

const DEFAULT_PREF: UserPreference = 'auto';
const PREF_STORAGE_KEY = 'dvai.transcription.userPref.v1';

function readUserPref(): UserPreference {
    if (typeof localStorage === 'undefined') return DEFAULT_PREF;
    const v = localStorage.getItem(PREF_STORAGE_KEY);
    if (v === 'auto' || v === 'local-ai' || v === 'basic' || v === 'cloud') return v;
    return DEFAULT_PREF;
}

function makeAdapter(tier: Tier, model?: string): TranscriberAdapter {
    if (tier === 'web-speech') return new WebSpeechAdapter();
    if (tier === 'local-whisper') return new WhisperLocalAdapter({ model: (model as any) ?? 'whisper-tiny' });
    return new CloudSttAdapter();
}

/**
 * useTranscriptionBroadcaster — replaces useLocalTranscriptionBroadcaster.
 *
 * Picks a transcription tier via the strategy selector, runs the
 * matching adapter against the local mic, broadcasts every event over
 * LiveKit data, and ingests finals into Dexie. Watches for runtime
 * lag via AdaptiveMonitor and demotes one tier on chronic
 * fall-behind.
 */
export function useTranscriptionBroadcaster() {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    const isCcNeeded = remoteParticipants.some(
        (p: any) => p.attributes?.ccEnabled === 'true',
    );
    const isRecording = (room as any).isRecording;
    const isMicEnabled = localParticipant.isMicrophoneEnabled;
    const shouldRun = (isCcNeeded || isRecording) && isMicEnabled;

    const adapterRef = useRef<TranscriberAdapter | null>(null);
    const monitorRef = useRef<AdaptiveMonitor | null>(null);
    const cancelledRef = useRef(false);
    const [activeTier, setActiveTier] = useState<Tier | null>(null);

    useEffect(() => {
        cancelledRef.current = false;

        const tearDown = async () => {
            if (adapterRef.current) {
                try { await adapterRef.current.stop(); } catch {}
                adapterRef.current = null;
            }
            if (monitorRef.current) {
                monitorRef.current.stop();
                monitorRef.current = null;
            }
            setActiveTier(null);
        };

        if (!shouldRun) {
            tearDown();
            return;
        }

        let pref = readUserPref();

        const startWithTier = async (tier?: Tier) => {
            const strategy = await selectStrategy({ pref });
            const chosenTier = tier ?? strategy.tier;
            const chosenModel = tier ? undefined : strategy.model;
            console.log('[useTranscriptionBroadcaster] strategy', { strategy, chosenTier });

            const audioPub = (localParticipant as any).getTrackPublication?.('microphone');
            const stream = audioPub?.audioTrack?.mediaStream;
            if (!stream) {
                console.warn('[useTranscriptionBroadcaster] no mic track');
                return;
            }

            const adapter = makeAdapter(chosenTier, chosenModel);
            adapterRef.current = adapter;
            setActiveTier(chosenTier);

            adapter.onTranscript((event) => {
                if (cancelledRef.current) return;
                // Broadcast over LiveKit data
                const payload = {
                    utteranceId: `${localParticipant.identity}-${event.timestamp}`,
                    text: event.text,
                    isFinal: event.isFinal,
                    language: event.language,
                };
                const enc = new TextEncoder();
                room.localParticipant.publishData(enc.encode(JSON.stringify(payload)), {
                    topic: 'transcription',
                } as any);

                // Ingest finals to Dexie
                if (event.isFinal && event.text.trim()) {
                    ingestTranscript(
                        localParticipant.name || localParticipant.identity || 'You',
                        event.text,
                        room.name,
                        { language: event.language, tier: event.tier },
                    );
                }
            });

            try {
                await adapter.start(stream, localParticipant.identity ?? 'You');
            } catch (err) {
                console.error('[useTranscriptionBroadcaster] adapter start failed', err);
                toast.error(`Transcription unavailable on this tier (${chosenTier}). Falling back.`);
                if (chosenTier === 'cloud') {
                    pref = 'auto';
                    await startWithTier();
                } else if (chosenTier === 'local-whisper') {
                    await startWithTier('web-speech');
                }
                return;
            }

            // Adaptive monitor only meaningful for whisper-local (Tier 2)
            if (chosenTier === 'local-whisper') {
                const monitor = new AdaptiveMonitor({
                    onDemote: async () => {
                        if (cancelledRef.current) return;
                        toast(
                            "Switched to basic captions to keep up with the conversation. You can change this in Settings.",
                            { icon: 'ℹ️', duration: 5000 },
                        );
                        await tearDown();
                        await startWithTier('web-speech');
                    },
                });
                monitor.start();
                monitorRef.current = monitor;
                // Note: for v1 we don't wire mic-bytes-per-second into the
                // monitor automatically. The monitor remains a passive
                // safety net wired up via Tier 2 internals when latency
                // tracking is added in a follow-up.
            }
        };

        startWithTier();

        return () => {
            cancelledRef.current = true;
            tearDown();
        };
    }, [shouldRun, localParticipant.identity, room]);

    return { activeTier };
}
```

- [ ] **Step 2: Make the old hook a re-export**

Replace `lib/hooks/useLocalTranscriptionBroadcaster.ts` body with:

```ts
// lib/hooks/useLocalTranscriptionBroadcaster.ts
/**
 * @deprecated Renamed to useTranscriptionBroadcaster (now tier-aware).
 * Re-exported here so existing call sites keep compiling. Removed in a
 * follow-up cleanup once all consumers migrate.
 */
export { useTranscriptionBroadcaster as useLocalTranscriptionBroadcaster } from './useTranscriptionBroadcaster';
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useTranscriptionBroadcaster.ts lib/hooks/useLocalTranscriptionBroadcaster.ts
git commit -m "transcription: add tier-aware useTranscriptionBroadcaster hook"
```

---

## Task 13: Settings UI — transcription quality dropdown

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Read current settings page**

Run: `cat app/settings/page.tsx | head -80`

- [ ] **Step 2: Add the dropdown UI**

Insert (in an appropriate position; the existing settings page
structure dictates exact location):

```tsx
// In the settings component:
import { useEffect, useState } from 'react';

const PREF_STORAGE_KEY = 'dvai.transcription.userPref.v1';
type Pref = 'auto' | 'local-ai' | 'basic' | 'cloud';

function TranscriptionQualitySetting() {
    const [pref, setPref] = useState<Pref>('auto');

    useEffect(() => {
        const v = localStorage.getItem(PREF_STORAGE_KEY) as Pref | null;
        if (v === 'auto' || v === 'local-ai' || v === 'basic' || v === 'cloud') {
            setPref(v);
        }
    }, []);

    const onChange = (next: Pref) => {
        setPref(next);
        localStorage.setItem(PREF_STORAGE_KEY, next);
    };

    return (
        <div className="setting-row">
            <label className="setting-label">
                Closed-caption quality
                <select
                    value={pref}
                    onChange={(e) => onChange(e.target.value as Pref)}
                    className="setting-select"
                >
                    <option value="auto">Auto (recommended)</option>
                    <option value="local-ai">Local AI (best privacy)</option>
                    <option value="basic">Basic (lowest battery)</option>
                    <option value="cloud">Cloud (paid plan)</option>
                </select>
            </label>
            <p className="setting-help">
                Auto picks the best option your device can run in real-time.
                Cloud requires a paid plan and sends audio to a server provider.
            </p>
        </div>
    );
}
```

Render `<TranscriptionQualitySetting />` somewhere appropriate on the
settings page. (Exact placement depends on the existing page
structure; integrate to match the surrounding setting groups.)

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx
git commit -m "settings: add transcription quality dropdown"
```

---

## Task 14: RecordingDetailClient "Improve transcript" button

**Files:**
- Modify: `app/recordings/[id]/RecordingDetailClient.tsx`

- [ ] **Step 1: Add the button + handler**

In `RecordingDetailClient.tsx`, find a suitable place to add a button.
Show only when `isPaidUser()` and existing transcripts have `tier === 'web-speech'`.

```tsx
import { isPaidUser } from '@/lib/auth/subscription';
import { runReTranscription } from '@/lib/transcription/reTranscription';
import { CloudSttAdapter } from '@/lib/transcription/adapters/cloudSttAdapter';

// Inside the component:
const [reTransProgress, setReTransProgress] = useState<{ processedSec: number; totalSec: number } | null>(null);
const [reTransRunning, setReTransRunning] = useState(false);
// Detect tier of existing transcripts: read first row's tier field.
// 'web-speech' rows are upgrade candidates; 'cloud' / 'local-whisper'
// rows are already best-quality so we don't re-transcribe them.
const [existingTier, setExistingTier] = useState<string | null>(null);
useEffect(() => {
    let cancelled = false;
    (async () => {
        const row = await db.transcripts
            .where('room_name')
            .equals(recording.roomName)
            .first();
        if (!cancelled) setExistingTier((row as any)?.tier ?? null);
    })();
    return () => { cancelled = true; };
}, [recording.roomName]);
const showImprove = isPaidUser() && existingTier === 'web-speech';

const handleImprove = async () => {
    setReTransRunning(true);
    try {
        // Use cloud adapter for re-transcription
        const cloud = new CloudSttAdapter();
        await runReTranscription({
            recordingAudioUrl: recording.audioUrl, // adjust to actual prop
            roomName: recording.roomName,           // adjust to actual prop
            transcribeChunk: async (pcm) => {
                // For v1: a wrapper that sends one chunk through cloud and waits for the final.
                // Implementation lives inside the adapter; this sketch is suggestive.
                throw new Error('TODO: wire CloudSttAdapter chunk-mode for re-transcription');
            },
            resultTier: 'cloud-rerun',
            onProgress: setReTransProgress,
        });
        toast.success('Transcripts upgraded.');
    } catch (err: any) {
        toast.error(`Re-transcription failed: ${err.message}`);
    } finally {
        setReTransRunning(false);
    }
};

// In JSX:
{showImprove && (
    <button onClick={handleImprove} disabled={reTransRunning}>
        {reTransRunning
            ? `Improving… ${reTransProgress ? `${Math.round(reTransProgress.processedSec)}/${Math.round(reTransProgress.totalSec)}s` : ''}`
            : 'Improve transcript quality'}
    </button>
)}
```

> **Implementation note for the engineer:** the CloudSttAdapter as
> shipped is a streaming/live adapter. For re-transcription you need a
> chunk-at-a-time mode. Either (a) extend the adapter with a
> `transcribeOneChunk(pcm)` static helper that opens a WebSocket,
> sends the chunk, waits for the final, closes; or (b) call Deepgram's
> REST `/v1/listen` endpoint directly from inside the
> `transcribeChunk` callback (simpler — REST path is `prerecorded`,
> $0.0125 / minute even cheaper than streaming). Pick (b) for v1.

Add a helper inside `lib/transcription/reTranscription.ts` to implement
the REST call, and use it as the default `transcribeChunk` factory.

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/recordings/[id]/RecordingDetailClient.tsx lib/transcription/reTranscription.ts
git commit -m "recordings: add 'Improve transcript' button (paid users)"
```

---

## Task 15: TestHarnessPanel — "Test transcription tiers" button

**Files:**
- Modify: `lib/test/TestHarnessPanel.tsx`

- [ ] **Step 1: Add a button that runs each adapter on a synthetic mic audio source**

Use `getUserMedia({ audio: true })` to get a real mic stream; run each
adapter for ~10s; record latency to first transcript. Display results
in the panel.

```tsx
const [tierTest, setTierTest] = useState<Record<string, { latencyMs?: number; ok: boolean; error?: string }>>({});

const runTierTest = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const adapters = [
        { name: 'web-speech', adapter: new WebSpeechAdapter() },
        { name: 'local-whisper', adapter: new WhisperLocalAdapter() },
        // Skip cloud unless paid
    ];
    const out: typeof tierTest = {};
    for (const { name, adapter } of adapters) {
        const t0 = performance.now();
        try {
            const firstEvent = await new Promise<number>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('no transcript in 15s')), 15000);
                adapter.onTranscript(() => {
                    clearTimeout(timeout);
                    resolve(performance.now() - t0);
                });
                adapter.start(stream, 'test-user').catch(reject);
            });
            out[name] = { ok: true, latencyMs: Math.round(firstEvent) };
        } catch (err: any) {
            out[name] = { ok: false, error: err.message };
        } finally {
            await adapter.stop();
        }
    }
    stream.getTracks().forEach((t) => t.stop());
    setTierTest(out);
};
```

Render a small results table.

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/test/TestHarnessPanel.tsx
git commit -m "test-harness: add 'Test transcription tiers' button"
```

---

## Task 16: Manual QA checklist

**Files:**
- Create: `docs/superpowers/qa/2026-04-30-transcription-multilang-qa.md`

- [ ] **Step 1: Write the QA checklist**

```md
# Multi-language Transcription — Manual QA Checklist

Date: 2026-04-30
Reference spec: `docs/superpowers/specs/2026-04-30-transcription-multilang-design.md`

## Tier selection

- [ ] Open meet on a desktop with WebGPU (Chrome). Settings → "Auto".
      Console shows `strategy.source: 'static-probe'`, tier
      `local-whisper`, model `whisper-base`.
- [ ] Open meet on a budget Android phone. Console shows tier
      `web-speech`, source `static-probe`, no Whisper download.
- [ ] On the desktop, switch settings to "Basic". Reload. Console shows
      tier `web-speech`, source `user-override`.

## Live captions

- [ ] On Tier 2 desktop: speak English, captions appear in <1s with
      punctuation.
- [ ] Speak Spanish: captions appear in Spanish without changing any
      setting.
- [ ] Code-switch mid-sentence ("Hola, how are you?"): both halves
      correctly transcribed.
- [ ] On Tier 3: same English speech transcribed with similar speed,
      no punctuation, single language only.

## Adaptive demotion

- [ ] On Tier 2 desktop: open ~50 browser tabs to throttle. Within ~30s
      of joining a meeting, toast appears: "Switched to basic captions
      to keep up…" Tier visible in dev console becomes web-speech.
      Captions continue.

## Re-transcription (paid only)

- [ ] With `isPaidUser()` temporarily forced to `true` for testing:
      open a recording that was captured at Tier 3. "Improve transcript
      quality" button appears. Click. Progress bar updates. After
      completion, transcripts in the page have proper punctuation and
      multilingual handling. Speaker labels preserved.
- [ ] With `isPaidUser()` returning false: the button is hidden.

## Failure modes

- [ ] Block network during model download: clear toast appears, tier
      falls back gracefully.
- [ ] Mic permission denied: meeting still joins, no transcription
      attempted, no crash.
- [ ] Tier 1 selected but `/api/transcription/cloud-token` returns 402:
      automatic fallback to Tier 2/3 with toast.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/qa/2026-04-30-transcription-multilang-qa.md
git commit -m "qa: add manual checklist for multi-language transcription"
```

---

## Task 17: Switch existing consumers to new hook

**Files:**
- Modify: any file currently importing `useLocalTranscriptionBroadcaster`

- [ ] **Step 1: Find consumers**

Run: `grep -rn "useLocalTranscriptionBroadcaster" lib/ app/ components/ --include="*.ts" --include="*.tsx"`

- [ ] **Step 2: Update each import**

For each consumer, change:

```ts
import { useLocalTranscriptionBroadcaster } from '@/lib/hooks/useLocalTranscriptionBroadcaster';
```

to:

```ts
import { useTranscriptionBroadcaster } from '@/lib/hooks/useTranscriptionBroadcaster';
```

And rename the call site from `useLocalTranscriptionBroadcaster()` to `useTranscriptionBroadcaster()`.

- [ ] **Step 3: Delete the deprecated alias**

```bash
rm lib/hooks/useLocalTranscriptionBroadcaster.ts
```

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add -A
git commit -m "transcription: migrate consumers to useTranscriptionBroadcaster, delete old alias"
```

---

## Final pre-merge verification

- [ ] **Step 1: Full unit test pass**

Run: `pnpm vitest run`
Expected: all green

- [ ] **Step 2: Build passes**

Run: `pnpm build`
Expected: PASS, no warnings about missing modules

- [ ] **Step 3: Manual QA checklist** (`docs/superpowers/qa/2026-04-30-transcription-multilang-qa.md`)

Walk through every item, mark ✓ or 🐞.

- [ ] **Step 4: Push branch**

```bash
git push -u origin dvai-bridge-v2-migration
```

(Engineer can open PR when satisfied.)
