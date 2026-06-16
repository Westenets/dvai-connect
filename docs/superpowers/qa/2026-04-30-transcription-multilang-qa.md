# Multi-language Transcription — Manual QA Checklist

**Date:** 2026-04-30
**Reference spec:** `docs/superpowers/specs/2026-04-30-transcription-multilang-design.md`
**Reference plan:** `docs/superpowers/plans/2026-04-30-transcription-multilang.md`

Walk through every item before merging the `dvai-bridge-v2-migration`
branch. Mark ✓ pass / 🐞 issue (with notes).

## Tier selection

- [ ] Open meet on a desktop with WebGPU (Chrome/Edge). Settings →
      Closed Captions → "Auto". Reload, join meeting. Browser console
      shows `[useTranscriptionBroadcaster] strategy` with
      `source: 'static-probe'`, `tier: 'local-whisper'`,
      `model: 'whisper-base'`.
- [ ] Open meet on a budget Android phone (or throttled Chrome with
      DevTools → Sensors → low-end CPU). Console shows
      `tier: 'web-speech'`, `source: 'static-probe'`, NO whisper-tiny
      download in Network tab.
- [ ] On the desktop, switch settings → Closed Captions → "Basic".
      Reload, rejoin. Console shows `tier: 'web-speech'`,
      `source: 'user-override'`.
- [ ] On the desktop, switch settings → Closed Captions → "Cloud".
      Console shows the strategy fell back to local-whisper (because
      `isPaidUser()` is false in v1) with reasoning about not being
      paid.

## Live captions

- [ ] On Tier 2 desktop: speak English, captions appear within ~1s with
      proper punctuation.
- [ ] Speak Spanish or any non-English language: captions appear in
      that language without changing any setting.
- [ ] Code-switch mid-sentence ("Hola, how are you?"): both halves
      correctly transcribed in their respective languages.
- [ ] On Tier 3: same English speech transcribed with similar speed,
      no/limited punctuation, single language only (matches old
      behavior).
- [ ] Two participants in a meeting, both speaking: each sees the
      other's captions; speaker labels are correct (each user labels
      their own utterances at source).

## Adaptive demotion

- [ ] On Tier 2 desktop: open ~50 browser tabs / start a heavy
      background task to throttle. Within ~30s of joining a meeting
      and speaking, toast appears: "Switched to basic captions to keep
      up with the conversation. You can change this in Settings."
      Tier in dev console becomes web-speech. Captions continue at
      lower quality without breaking.
- [ ] After demotion, the strategy cache for this session retains the
      original probe result; toggling settings to Auto and rejoining
      attempts Tier 2 again (one-shot demote per session is intentional).

## Re-transcription (paid users only)

- [ ] Temporarily edit `lib/auth/subscription.ts` to return `true`
      from `isPaidUser()`. Reload the recording-detail page for a
      recording where transcripts came from Tier 3 (Web Speech).
      "Improve transcript quality" button appears above the
      transcript list. Click it. Progress bar updates with
      `Xs / Ys`. After completion: transcripts in the page have
      proper punctuation and (if multilingual recording) per-chunk
      language detection. Speaker labels are preserved.
- [ ] Revert `isPaidUser()` to return `false`. Reload — the button is
      hidden.
- [ ] Open a recording whose transcripts came from Tier 1 or Tier 2
      (cloud / local-whisper) — even with paid forced true, the
      "Improve transcript" button does NOT show (already best
      quality).

## Failure modes

- [ ] Block network requests to `huggingface.co` in DevTools while on
      Tier 2: the model download fails, toast appears, tier falls
      back to Tier 3 on next attempt. No silent failure.
- [ ] Mic permission denied on browser: meeting still joins, no
      transcription attempted, no crash. The "Test transcription
      tiers" button in TestHarnessPanel reports the permission error
      cleanly.
- [ ] Tier 1 selected but `/api/transcription/cloud-token` returns 402
      (default with `isPaidUser()` returning false): adapter start
      throws, toast informs user, automatic fallback to Tier 2/3.

## Test harness

- [ ] Open a meeting, click the dev-environment "Test Harness" button
      in ControlBar. The new "Transcription Tier Test" section
      appears (Section 4, below RAG Search). Click "Run Tier Test".
      Web Speech and Local Whisper each get tested in sequence;
      first-transcript latency reported per tier. Cloud is skipped.

## Build/test verification

- [ ] `pnpm vitest run` — all green
- [ ] `pnpm build` — succeeds, no missing-module warnings, no
      Turbopack warnings
- [ ] No regressions in the existing meeting flow: join, speak, see
      live CC, end meeting, recording listed in dashboard, recording
      detail loads transcripts and runs Gemma.

## Out-of-scope (verify these still work; should be unchanged)

- [ ] LiveKit data broadcast of transcripts to other participants
      (existing behavior preserved by useTranscriptionBroadcaster).
- [ ] Dexie storage of transcripts; `useMeetingIntelligence` runs
      Gemma summary post-meeting.
- [ ] Embedder + RAG search pipeline (uses the new
      `@westenets/dvai-bridge-core`).
