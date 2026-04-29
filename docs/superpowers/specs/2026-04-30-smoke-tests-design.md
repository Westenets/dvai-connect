# Real-World AI Pipeline Smoke Tests — Design Spec

**Status:** Draft for implementation. Autonomous defaults applied; user
to review in morning.
**Problem ID:** #3 in the dvai-meet roadmap
**Implements:** End-to-end smoke testing of the on-device AI pipeline
with structured latency + accuracy metrics.

---

## 1. Problem statement

The dvai-meet AI pipeline has many moving pieces:

- Live transcription (3 tiers)
- Dexie persistence + embedder
- LlamaIndex RAG retrieval
- Gemma 4 generation (summary, action items, questions)

Today the only verification is manual: open a meeting, talk, hope the
captions appear, end meeting, open recording detail, hope Gemma
finishes. There's no:

1. **Quantified latency per stage** (model load, first inference,
   end-to-end)
2. **Resource snapshots** (memory before/after model load)
3. **Repeatable accuracy check** (does Gemma actually produce useful
   summaries from a known input?)
4. **Pass/fail thresholds** to know when something regressed

We need a **smoke suite** that runs end-to-end, captures real metrics,
and reports pass/fail against documented thresholds. Goals: catch
regressions before users do, and give the team confidence that the
pipeline works on a given device class.

## 2. Goals

1. One-click "Run Full Smoke Suite" button in `TestHarnessPanel` that
   exercises every AI subsystem in order.
2. Structured metrics output: per-stage latency + memory + pass/fail.
3. JSON report downloadable for cross-device comparison.
4. Documented acceptance thresholds (per device class — modern
   desktop, mobile, etc.).
5. Reuses existing infrastructure: `runIntelligenceTest`, mock meeting
   data, `embedderService`, `llmService`, transcription adapters.

## 3. Non-goals

- Headless CI execution. Smoke suite is a real-browser test (uses
  WebGPU, WebAudio, Web Speech, etc.) — must run in a real browser
  with real hardware. CI variants are a separate, smaller test that
  hits the OpenAI-compatible mock endpoint via vitest+happy-dom.
- Continuous monitoring / telemetry. The smoke suite is run on demand
  by developers, not constantly in production.
- Load testing (concurrent users, server scaling). Different problem.

## 4. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ TestHarnessPanel — "Full Smoke Suite" button               │
└────────────────────┬───────────────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────────────┐
│ runFullSmokeSuite(opts) → SmokeReport                       │
│   Sequence:                                                 │
│   1. Hardware probe                                         │
│   2. Embedder load + first inference                        │
│   3. Gemma load + first inference                           │
│   4. Live transcription per tier (mic-based or skipped)     │
│   5. Mock meeting → ingest 30 transcripts                   │
│   6. RAG search end-to-end                                  │
│   7. AI pipeline (summary/actions/questions extraction)     │
│ Each step: capture { startMs, endMs, beforeMem, afterMem }  │
└────────────────────┬───────────────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────────────┐
│ SmokeReport rendered in panel + downloadable JSON           │
└────────────────────────────────────────────────────────────┘
```

## 5. Components

### 5.1 New files

- **`lib/test/smokeSuite.ts`** — orchestrator. `runFullSmokeSuite(opts)`
  returns a `SmokeReport` and emits progress callbacks.
- **`lib/test/smokeSuiteTypes.ts`** — types: `SmokeReport`,
  `StageResult`, `Threshold`.
- **`lib/test/smokeSuiteThresholds.ts`** — per-device-class
  thresholds; the report uses these to flag pass/fail.

### 5.2 Modifications

- **`lib/test/TestHarnessPanel.tsx`** — add a new section "Full Smoke
  Suite" with a Run button, live progress per stage, and download JSON.

### 5.3 Reused, unchanged

- `lib/test/runIntelligenceTest.ts` — full LLM pipeline test
- `lib/test/mockMeeting.ts` — 30 mock utterances
- `lib/transcription/adapters/*` — tier adapters
- `lib/embedder.ts`, `lib/llmService.ts`

## 6. The smoke report shape

```ts
interface SmokeReport {
    timestamp: number;
    durationMs: number;
    device: {
        userAgent: string;
        cores: number;
        ramGB?: number;
        hasWebGPU: boolean;
    };
    stages: StageResult[];
    overall: 'pass' | 'pass-with-warnings' | 'fail';
}

interface StageResult {
    name: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    /** JS heap size in bytes (Chrome only). */
    beforeHeapBytes?: number;
    afterHeapBytes?: number;
    deltaHeapBytes?: number;
    /** Stage-specific metrics. */
    extra?: Record<string, unknown>;
    status: 'pass' | 'warn' | 'fail' | 'skipped';
    message?: string;
}
```

## 7. Acceptance thresholds (defaults)

Tunable in `smokeSuiteThresholds.ts`. Apply per device class.

### Modern desktop (WebGPU, ≥8 cores, ≥8GB)

| Stage | Pass | Warn | Fail |
|---|---|---|---|
| Embedder load | <8s | 8–15s | >15s |
| Embedder first embed | <500ms | 500–2000ms | >2000ms |
| Gemma load | <60s | 60–120s | >120s |
| Gemma first inference | <8s | 8–20s | >20s |
| Transcription tier (Tier 2) first transcript | <2s | 2–5s | >5s |
| RAG retrieval | <500ms | 500–2000ms | >2000ms |
| Full AI pipeline (mock meeting) | <120s | 120–240s | >240s |
| Heap delta (per model load) | <500MB | 500–1500MB | >1500MB |

### Budget mobile / older laptop (no WebGPU)

| Stage | Pass | Warn | Fail |
|---|---|---|---|
| Embedder load | <30s | 30–60s | >60s |
| Embedder first embed | <2s | 2–5s | >5s |
| Gemma load | (skipped — would never finish on this hardware) |
| Transcription tier (Tier 3) first transcript | <2s | 2–5s | >5s |
| RAG retrieval | <2s | 2–5s | >5s |
| Heap delta (per model load) | <300MB | 300–800MB | >800MB |

These thresholds are suggested defaults based on published
transformers.js + WebGPU benchmarks (mid-2025). Adjust based on real
data once we run it on a few devices.

## 8. Implementation slices

### 8.1 Task 1: Types + thresholds

Create `lib/test/smokeSuiteTypes.ts` and `smokeSuiteThresholds.ts`.

### 8.2 Task 2: Stage runner + report orchestrator

Create `lib/test/smokeSuite.ts` with `runFullSmokeSuite(opts)` —
sequences stages, captures timings + heap, applies thresholds.

### 8.3 Task 3: TestHarnessPanel UI section

New section "Full Smoke Suite" with a Run button, live progress (one
row per stage as it completes), Download JSON button.

### 8.4 Task 4: Verification

- Run `pnpm vitest run` → green
- Run `pnpm build` → green
- Manual: open meeting, click "Full Smoke Suite", verify report
  generates and matches expectations on this dev machine

## 9. Failure modes

- Stage timeout: report `fail` with timeout message; continue with
  next stage (don't block the whole suite).
- Model load fails (network/storage): report `fail` for that stage,
  skip dependent stages (e.g. if Gemma load fails, skip the AI
  pipeline stage).
- WebGPU not available: skip Gemma stage with `skipped` status.
- Mic permission denied: skip transcription tier stage with `skipped`.

## 10. Future work (deferred)

- **Headless CI variant** — vitest+happy-dom version that exercises
  the OpenAI-compatible mock endpoint and the alignment logic, but
  doesn't load real models. Catches regressions in the orchestration
  code without needing GPUs.
- **Cross-device baseline tracking** — upload smoke reports to a
  central store, plot trends over time per device class.
- **Comparative regression test** — diff a new report against a saved
  baseline and flag any stage that regressed >20%.
