# Multi-language Transcription — Design Spec

**Status:** Draft for implementation
**Authors:** Deep + Claude (brainstorming session 2026-04-30)
**Problem ID:** #2 in the dvai-meet roadmap
**Implements:** Closed-caption multilingual support, code-switching, hardware-aware tier selection, optional paid re-transcription

---

## 1. Problem statement

The meet app's live closed-caption (CC) feature uses the browser's
`SpeechRecognition` API. Today the recognizer's language is unset, which
means the browser falls back to the document `lang="en"` — effectively
locking transcription to English regardless of who's actually speaking.
Real meetings are bilingual or multilingual; some speakers code-switch
mid-sentence. The current pipeline produces unusable transcripts in those
cases.

Constraints we must respect:

- **Live CC must be realtime.** Saving the audio and transcribing later
  is acceptable for the recording's after-the-fact summary, but live CC
  is a synchronous-feeling UX feature.
- **Privacy is the product MOAT**, especially for enterprise. Default
  behavior must keep audio on the user's device.
- **Hardware spectrum is huge.** Modern desktops have WebGPU and 16+
  cores; budget mobile has neither. Both must work, just at different
  quality levels.
- **Cloud STT costs real money.** A naive "always use cloud" design at
  even modest scale (1000 weekly users) costs $26K–$65K/month at
  third-party rates. The free tier must not depend on it.

## 2. Goals

1. Live captions in the speaker's actual language, not hardcoded
   English.
2. Handle code-switching (user mid-sentence switches languages) — at
   least at Tier 1 and Tier 2.
3. Hardware-aware tier selection: best quality the device can sustain
   in real-time.
4. Privacy-first by default — free users' audio never leaves their
   device.
5. Cloud transcription is opt-in and gated to paid users. The free tier
   stays at $0 STT cost to the platform.
6. Speaker diarization without extra infrastructure — it falls out of
   the live-transcription flow because each user generates and labels
   their own utterances.
7. Optional post-meeting "improve transcript quality" feature for paid
   users (re-transcribe a recording's audio with cloud STT, align to
   existing speaker labels).

## 3. Non-goals (this spec)

- Punctuation-enhancer model layered on top of Web Speech (rejected —
  doesn't fix bad underlying transcription, complexity not worth it).
- Server-side persistence of live transcripts (already handled
  client-side via Dexie + LiveKit data broadcast).
- Stripe integration / subscription state machine — that's problem #5.
- End-to-end smoke tests of the AI pipeline — that's problem #3.

## 4. Future work (intentionally deferred)

These are real, important features captured here so the design above
doesn't paint us into corners that block them later. They get their
own specs when prioritized.

- **Catching up late-joiners with historical transcripts.** When a
  participant joins mid-meeting, they should be able to request the
  earlier transcripts from peers (LiveKit data) or from a server-side
  store. The current design already has each peer broadcasting their
  own utterances — extending that to "request history on join" is a
  small additive feature.
- **Cross-meeting speaker identification.** Persistent speaker IDs
  via voice fingerprinting so "Alice spoke 12 times across these 5
  meetings" is queryable. Requires a separate embedder model plus a
  consent flow.
- **Real-time translation overlay** on live captions. High-priority
  per the user. Layers on top of this design — the transcript event
  type already includes `language`, so a translation pipeline can
  consume the stream and emit translated captions per-recipient.

## 5. Architecture

### 5.1 The 3-tier model

| Tier | Where | Model | Selected when | Quality | Code-switch? |
|---|---|---|---|---|---|
| **1 — Cloud STT** | Provider (Deepgram Nova-3 default) | Provider's multilingual model | Paid user has explicitly enabled cloud, OR adaptive monitor demoted from Tier 2 with cloud as fallback | Best | Native |
| **2 — Local Whisper** | Browser worker via `@westenets/dvai-bridge-core` | `whisper-base` (capable HW) or `whisper-tiny` (constrained HW) | Default when hardware probe says capable | Good | Native (auto-detects per chunk) |
| **3 — Web Speech API** | Browser-native | `webkitSpeechRecognition` / `SpeechRecognition` | Fallback when Tier 2 not viable AND user has no Tier 1 access; or after adaptive demotion | Mediocre, single language at a time | No |

**Why diarization comes free at every tier:** each participant runs
their own transcriber against their own mic, tags utterances with their
own identity, and broadcasts. The "who said what" labeling happens at
the source. No track-egress, no diarization model, no timestamp
reassembly.

### 5.2 Tier-selection flow

```
┌──────────────────────────────────┐
│  TranscriptionStrategySelector   │
│  (runs once per app session,     │
│   result cached in localStorage) │
└──────────────┬───────────────────┘
               │
   ┌───────────┴────────────┐
   ▼                        ▼
┌──────────────┐     ┌──────────────┐
│ HardwareProbe│     │ User Prefs   │
│  (static)    │     │ + isPaidUser │
└──────┬───────┘     └──────────────┘
       │
       ▼
   ┌────────────────────┐
   │ Static result?     │
   ├────────────────────┤
   │ "definitely T2"    │──┐  (skip benchmark, run only if model
   │ "definitely T3"    │──┤   variant decision needed)
   │ "borderline"       │──┘
   └────────────────────┘
       │ if borderline or T2-but-pick-model
       ▼
┌──────────────────────┐
│ CapabilityBenchmark  │  Downloads whisper-tiny once, runs 5s
│  (5–10s, on-demand)  │  synthetic clip, measures realtime factor
└──────┬───────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ Selected: Tier + model variant   │
│ (cached in localStorage)         │
└──────────────────────────────────┘
```

**During the meeting**, AdaptiveMonitor watches the audio buffer
between mic input and transcribed output. If the buffer grows beyond
5 seconds for 3 consecutive checks, the selector demotes one tier
with a UI toast. This catches cases the static probe and benchmark
both missed (thermal throttling, background load, etc.).

### 5.3 Live-transcription data flow

```
Mic (LiveKit local audio track)
       │
       ▼
┌──────────────────────┐
│ Selected adapter     │  WhisperLocalAdapter / CloudSttAdapter
│ (per the selector)   │  / WebSpeechAdapter — all implement same
└──────┬───────────────┘  TranscriberAdapter interface
       │
       │ TranscriptionEvent {
       │   speaker, text, isFinal,
       │   language, tier, timestamp
       │ }
       ▼
   ┌──────┬──────────┬─────────────┐
   ▼      ▼          ▼             ▼
Live CC  LiveKit   ingestTranscript(...)  AdaptiveMonitor
overlay  data      → Dexie row             (passive watcher)
         broadcast → embedder
```

### 5.4 Re-transcription flow (paid users only)

```
RecordingDetailClient
   │
   │ if (isPaidUser() && existingTranscripts.tier === 'web-speech')
   ▼
[Improve transcript quality] button
   │
   ▼
ReTranscriptionService.run(recordingId)
   │
   ├─ Fetch egress recording audio URL (server)
   ├─ Stream chunks to selected re-trans tier (Cloud or capable Local)
   ├─ For each new chunk: align to existing speaker label by timestamp
   ├─ Replace text + language in Dexie row
   └─ Re-embed
   │
   ▼
UI refreshes transcripts; tier on rows updated to 'cloud-rerun'
```

## 6. Components

All paths relative to repo root. New files marked **NEW**, modified
files marked **MOD**.

### 6.1 Selection layer

- **NEW** `lib/transcription/strategy.ts` — `TranscriptionStrategySelector`
  - `select(): Promise<{ tier: Tier; model?: 'whisper-tiny' | 'whisper-base'; source: 'cache'|'probe'|'benchmark'|'override' }>`
  - Caches result in `localStorage` under key `dvai.transcription.strategy.v1`
  - Cache invalidates on hardware-fingerprint change

- **NEW** `lib/transcription/hardwareProbe.ts` — `HardwareProbe`
  - Pure function. Reads `navigator.gpu`, `navigator.hardwareConcurrency`,
    `navigator.deviceMemory`, mobile UA detection.
  - Returns `{ category: 'definitely-tier-2' | 'borderline' | 'definitely-tier-3'; recommendedModel?: 'whisper-tiny'|'whisper-base'; reasoning: string }`

- **NEW** `lib/transcription/benchmark.ts` — `CapabilityBenchmark`
  - Downloads whisper-tiny once (~75MB), runs synthetic 5s transcription
  - Returns `{ realtimeFactor: number; recommendedTier: Tier; recommendedModel: string }`
  - Result cached in IndexedDB under hardware-fingerprint key

- **NEW** `lib/transcription/adaptiveMonitor.ts` — `AdaptiveMonitor`
  - Active during meetings. Tracks buffer-of-audio vs buffer-of-transcribed.
  - Fires `onTierDemotionNeeded` when behind > 5s for 3 consecutive checks.

### 6.2 Adapter layer

- **NEW** `lib/transcription/adapters/types.ts` — `TranscriberAdapter` interface

  ```ts
  interface TranscriberAdapter {
    start(audioStream: MediaStream): Promise<void>;
    stop(): Promise<void>;
    onTranscript(cb: (event: TranscriptionEvent) => void): () => void;
    readonly tier: Tier;
    readonly model?: string;
  }

  interface TranscriptionEvent {
    speaker: string;       // localParticipant.identity
    text: string;
    isFinal: boolean;
    language: string | null;  // BCP-47, e.g. "en-US", "es-ES", null when unknown
    tier: Tier;
    timestamp: number;     // Date.now() at emission
  }
  ```

- **NEW** `lib/transcription/adapters/whisperLocalAdapter.ts`
  - Wraps a new `DVAI` instance configured for ASR:
    - `backend: "transformers"`
    - `pipelineTask: "automatic-speech-recognition"`
    - `transformersModelId: "Xenova/whisper-tiny"` or `"Xenova/whisper-base"`
    - `transport: "none"` — we call runPipeline directly
    - Default worker URL — runs in worker thread (free win from problem #1)
  - Streaming: uses Whisper's chunking, optionally with a VAD (Voice
    Activity Detection) preprocessor to chunk at silences
  - Implementation of VAD: lightweight RMS-based chunking for v1
    (Silero VAD via transformers.js noted as future improvement)

- **NEW** `lib/transcription/adapters/cloudSttAdapter.ts`
  - Default provider: **Deepgram Nova-3** ($0.26/streaming-hour, native
    multilingual + code-switching + punctuation)
  - WebSocket connection to Deepgram, streaming audio chunks
  - API key sourced from a server-side endpoint (paid users only) —
    NEVER exposed in client bundle
  - Reconnect with exponential backoff (max 3 retries)

- **NEW** `lib/transcription/adapters/webSpeechAdapter.ts`
  - Refactor of current `useLocalTranscriptionBroadcaster.ts` logic
    into the adapter shape. No behavior change.

### 6.3 Re-transcription

- **NEW** `lib/transcription/reTranscription.ts` — `ReTranscriptionService`
  - `async run(recordingId: string, opts: { tier: 'cloud' | 'local-capable' }): Promise<void>`
  - Fetches recording audio, streams through selected adapter
  - Aligns new chunks to existing speaker-labeled chunks by timestamp
  - Replaces text + language in Dexie, re-embeds, updates `tier` field

### 6.4 Auth/subscription stub

- **NEW** `lib/auth/subscription.ts`
  - `isPaidUser(): boolean` — returns `false` for v1 (this spec).
  - Wired to real Appwrite subscription state in problem #5.
  - Single chokepoint so swap is one file.

### 6.5 Refactors of existing code

- **MOD** `lib/hooks/useLocalTranscriptionBroadcaster.ts` →
  rename to **NEW** `lib/hooks/useTranscriptionBroadcaster.ts`.
  - Same hook signature, but delegates to whichever adapter the
    strategy selected.
  - All consumers (currently this is `VideoConference.tsx` indirectly)
    keep working without changes if we keep an exported alias.

- **MOD** `lib/db.ts` — `ingestTranscript()`
  - Add optional `language: string | null` and `tier: Tier` parameters.
  - Add the columns to the Dexie schema; bump schema version (Dexie
    handles migration via `.upgrade()`).

- **MOD** `app/recordings/[id]/RecordingDetailClient.tsx`
  - Add the "Improve transcript quality" button, gated on
    `isPaidUser() && existingTranscriptTier === 'web-speech'`.
  - Wire to `ReTranscriptionService.run()` with progress UI.

- **MOD** `lib/test/TestHarnessPanel.tsx`
  - Add a "Test transcription tiers" button that runs each tier
    against a synthetic audio sample, reports latency.

### 6.6 UI / settings

- **MOD** `app/settings/page.tsx` (with possible new section under
  `app/settings/menu/`)
  - Transcription quality dropdown:
    - **Auto** (default, runs hardware probe)
    - **Local AI** (forces Tier 2; falls back to Tier 3 if hardware can't)
    - **Basic** (forces Tier 3 — battery saver)
    - **Cloud** (forces Tier 1 — paid only, disabled with upsell otherwise)
  - "Run benchmark" button to manually re-evaluate hardware

## 7. Error handling

| Failure | Detection | Recovery |
|---|---|---|
| HardwareProbe API unavailable (e.g. older browser) | try/catch around `navigator.gpu` access | Default to Tier 3, log warning |
| Benchmark download fails (network) | fetch rejection | Use static-probe-only result |
| Whisper model fails to load (Tier 2) | adapter `start()` rejects | Fallback to Tier 3 with toast |
| Cloud STT auth fails (Tier 1) | WebSocket close 401/403 | Toast "Cloud unavailable, switching to local" → Tier 2 if available, else Tier 3 |
| Cloud STT mid-meeting disconnect | adapter onDisconnect | Reconnect 3× with backoff; permanent failure → demote tier with toast |
| Web Speech `onerror` (current behavior) | event handler | Existing restart pattern (preserved from current code) |
| AdaptiveMonitor detects lag | buffer-delta threshold breached | Demote one tier, one-time toast per session |
| `isPaidUser()` returns false during Tier 1 init | check inside selector | Refuse Tier 1 selection, fall through |
| Re-transcription fails partway | per-chunk try/catch | Keep originals for failed chunks, save what succeeded, surface error toast |
| Mic track unavailable (mute) | LiveKit track === null | No-op; not an error |

## 8. Testing strategy

- **Unit (vitest):**
  - `HardwareProbe` with mocked `navigator` for various device profiles
  - `CapabilityBenchmark` with mocked Whisper inference times
  - `TranscriptionStrategySelector` for various probe + pref + paid combos
  - `AdaptiveMonitor` with synthetic buffer-growth patterns
  - `ReTranscriptionService` alignment logic with synthetic timestamps
- **Adapter contract tests** — each adapter satisfies the interface,
  mockable for higher-level tests
- **Integration via TestHarnessPanel** — "Test transcription tiers"
  button: runs each tier against a 30s synthetic audio file, reports
  per-tier latency and (rough) accuracy
- **Manual QA checklist**:
  - Bilingual code-switching test (real bilingual speaker)
  - Mid-meeting forced demotion (start at Tier 2, manually trigger via
    dev override, verify graceful transition)
  - Paid-user re-transcription end-to-end against a real recording

## 9. Cost model assumptions

- **Tier 1 cost target**: ≤ $0.30/streaming-hour (Deepgram Nova-3 is
  $0.26 — well within target).
- **Tier 2 cost**: zero — runs on user's hardware.
- **Tier 3 cost**: zero — uses browser-native API.
- **Re-transcription cost**: ~$0.30/recording-hour, paid users only.
- **Free tier monthly STT cost target**: $0 (achieved by gating Tier 1
  to paid users).

These constraints come from problem-#5 strategy S1+S5 (local AI is the
free tier; cloud is paid-only).

## 10. Open questions / decisions deferred to implementation

- **VAD library choice**: Silero VAD (heavier, more accurate) vs. a
  custom RMS-based chunker (lighter, sometimes splits mid-word). Start
  with RMS, upgrade if accuracy suffers. Both are runtime-swappable
  behind a `VadStrategy` interface.
- **Cloud STT key storage**: server-side endpoint that proxies the
  WebSocket initial handshake, so the client never sees a long-lived
  Deepgram key. Implementation lives in the API layer (deferred to the
  implementation plan).
- **Settings UI exact placement**: depends on the existing settings
  structure. Pick during implementation.

## 11. Acceptance criteria

This spec is "done" when:

- A user joins a meeting on a modern device → automatic Tier 2 with
  whisper-base, multilingual, captions appear in their language
- A user joins on a budget mobile → Tier 3 (Web Speech), captions
  work in their browser's default language, no crash
- A bilingual user code-switches mid-sentence on Tier 2 → both
  segments correctly transcribed in their respective languages
- A Tier 2 user whose device throttles mid-meeting → AdaptiveMonitor
  fires, toast shown, swap to Tier 3, captions continue (degraded
  quality but no break)
- A paid user opens a Tier-3 recording → "Improve transcript" button
  appears → click runs re-transcription → transcripts replaced with
  cloud-quality version, speaker labels preserved
- All failure modes in §7 produce a usable degraded experience with a
  user-facing toast, not a silent failure or crash
