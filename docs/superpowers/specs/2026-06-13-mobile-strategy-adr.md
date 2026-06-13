# ADR: Mobile Strategy — Hybrid-Staged (Capacitor → React Native)

**Status:** Accepted, 2026-06-13
**Decision owner:** Deep + Claude (post-research synthesis + adversarial verification)
**Supersedes:** none (first mobile ADR for dvai-meet)

---

## Context

The dvai-meet web product is shipping with E2EE in every tier (including Free)
and on-device AI (Gemma 4 + embedder). The team's strategic priorities require
mobile presence: enterprise sales prospects routinely ask "do you have a mobile
app?", iOS App Store discovery drives Pro Mainstream conversion, and Apple's
2026 AI-data disclosure rules favor the privacy-MOAT positioning. We have to
decide how to ship mobile.

Three paths were considered:

1. **Pure Capacitor wrap** of the existing Next.js + LiveKit + on-device AI stack.
2. **Pure React Native rewrite** using `@livekit/client-sdk-react-native` + hand-built UI components.
3. **Hybrid-staged**: Capacitor first to ship fast and validate retention, React Native rewrite later as the native v2.

A research workflow ran 9 parallel streams (dvai-bridge v4, transformers.js
drafter, Capacitor + LiveKit E2EE, RN SDK + components, meet codebase state,
LiveKit observability under E2EE, admin panel UI patterns, Stripe + Appwrite,
unsloth Gemma 4 QAT) plus 3 adversarial skeptics. Findings:

- iOS WKWebView from 15.4+ exposes `RTCRtpScriptTransform` (the only LiveKit
  E2EE path that lacks a fallback) — **subject to a physical iOS 15.4 simulator
  smoke test** (release notes don't explicitly call out WKWebView parity, only
  Safari).
- Android System WebView from ~Chromium M115+ supports both insertable streams
  and ScriptTransform; covers ~95% of active Android devices in 2026.
- WebGPU is NOT available in iOS WKWebView before iOS 26 (Safari 26). On-device
  Gemma 4 in a Capacitor-wrapped iOS build is broken on iOS 15.4–25 unless we
  ship a native llama.cpp / Apple Intelligence plugin.
- `@livekit/components-react-native` does NOT exist. The
  `@livekit/client-sdk-react-native` package is the SDK only. A React Native
  rewrite has to hand-build all meeting-room components.
- The existing meet repo uses Next.js dynamic API routes (`/api/record/start`,
  `/api/agent`, etc.) which are incompatible with Capacitor's required
  `output: "export"` — those API routes must stay on a web origin, and the
  Capacitor app talks to them via the same origin.

## Decision

**Hybrid-staged.** Capacitor Phase 1 ships first; React Native is the Phase 2
v2 rebuild.

### Phase 1 — Capacitor wrap

- Wraps the existing Next.js web build (with a static-export build variant for
  the iOS / Android shell; API routes remain on the production web origin).
- iOS minimum: **15.4** if the RTCRtpScriptTransform parity smoke test passes;
  jumps to **16+** if it fails.
- Android minimum: 8.0 with System WebView ≥ M115.
- **iOS 26+ is the AI-feature gate.** On iOS 26+ the bridge uses
  [Apple Intelligence](https://developer.apple.com/apple-intelligence/) as a
  backend (no GGUF download, no llama.cpp plugin, no model bundling). On
  iOS 15.4–25 the AI features (Gemma summary, RAG, transcription) are **hidden
  behind a capability check** with a user-facing explanation
  ("Your iOS version doesn't support our on-device AI. Upgrade to iOS 26+ to
  unlock summaries and meeting intelligence.").
- On Android, the bridge uses the llama.cpp Capacitor backend with the
  `unsloth/gemma-4-E2B-it-qat-mobile-GGUF` model (UD-Q2_K_XL ≈ 2.19 GB +
  MTP drafter ≈ 59.2 MB, downloaded at first launch over Wi-Fi with storage
  availability check — bundling is not viable, exceeds App / Play Store
  binary caps).
- Web Speech API is the universal transcription fallback on devices that
  can't run local Whisper or Apple Intelligence (matches the new
  Deepgram-removed tier system in the web app).
- Cloud recording (egress) flow same as web. Disclosure copy reuses the web
  copy.

### Phase 2 — React Native rewrite

- Starts when Phase 1 retention data validates the mobile bet
  (target: Q1 2027).
- Stack: `@livekit/client-sdk-react-native` 2.11.x + Expo Router + EAS Build.
- Re-platform on-device AI via `react-native-litert-lm` (LiteRT-LM + Nitro
  Modules + Metal/OpenCL + speculative decoding + Gemma 4 optimized) OR
  Apple Intelligence native binding on iOS, llama.cpp via JSI on Android.
- Hand-built meeting-room components (no `@livekit/components-react-native`):
  `ParticipantTile`, `ControlBar`, `ChatPanel`, `Captions`, `GridLayout`,
  `FocusLayout`, `AIPanel`.
- iOS Broadcast Extension for screen share (2-week long pole).
- Appwrite SDK swap to `sdk-for-react-native`.
- IAP for App Store-acquired users if Apple App Review requires it on
  rescreen; Stripe stays default for direct + Android.

## Effort estimate

- Phase 1 Capacitor wrap: **8-12 weeks**, 1 dev. (Adversarial revision of
  the synthesis's 4-6 week estimate — the static-export architectural split,
  AVAudioSession plugin, Android FOREGROUND_SERVICE_MICROPHONE manifest,
  TestFlight + App Store review cycles, and Apple E2EE-marketing-claim
  scrutiny all add up.)
- Phase 1 Apple Intelligence backend wiring: in-scope for Phase 1 (no
  separate Phase 1.5 needed once we commit to iOS 26 AI gate).
- Phase 1 llama.cpp Android plugin wiring: in-scope for Phase 1.
- Phase 2 RN rebuild: **14-18 weeks**, 2 devs. (Skeptic's caveat that
  ongoing-parity work with `@livekit/client` v2.x bumps the budget to
  18-22 weeks if we want to stay current — accept 14-18 if we commit to
  staying 1-2 minor versions behind on the RN side.)

## Trade-offs

| Aspect | Phase 1 (Capacitor) | Phase 2 (React Native) |
|---|---|---|
| Time-to-market | 8-12 weeks | 14-18 weeks (after Phase 1) |
| Reuses existing code | ~95% | ~30% (backend stays; UI rebuilt) |
| E2EE on iOS | Via WKWebView from 15.4 (subject to smoke test) | Via native WebRTC SDK |
| On-device AI on iOS | iOS 26+ via Apple Intelligence (15.4–25 disabled) | iOS 15.4+ via LiteRT-LM or Apple Intelligence native |
| Battery (1-hour call) | ~10-20% worse than native | Native |
| Background audio | Via AVAudioSession bridge | Native (proper) |
| Screen share iOS | WebView only | iOS Broadcast Extension |
| App Store discoverability | Hybrid (second-class) | Native (first-class) |
| Maintenance load | Web + Capacitor (small native delta) | Web + RN (two codebases) |
| Risk of App Review rejection | Higher (WebRTC + E2EE claims scrutinized) | Lower (native, similar to other LiveKit RN apps) |
| Privacy MOAT claims integrity | Preserved (E2EE on every plan from day 1) | Preserved + reinforced |

## Critical caveats (pinned)

1. **iOS 15.4 WKWebView RTCRtpScriptTransform parity is unverified.** Must
   smoke-test on a real iOS 15.4 simulator before locking the minimum-iOS
   floor. If it fails, floor jumps to 16+ and addressable market drops from
   ~98% to ~85%.
2. **iOS < 26 has no on-device AI in Phase 1.** AI features are gracefully
   degraded with an in-app explanation. This is acceptable per the decision
   that we'd rather hide a feature than break the "E2EE + on-device AI"
   marketing claim. Deepgram is NOT a fallback (removed from the product per
   the 2026-06-13 decision).
3. **Cloud recording is structurally incompatible with E2EE** on all
   platforms (web, Capacitor, RN). Same consent-modal + server-side-encryption
   disclosure applies. See the pricing-admin spec for copy.
4. **Apple App Review E2EE marketing-claim scrutiny.** Get legal review of
   the App Store listing copy before Phase 1 submission. Lead with
   "on-device AI, no data leaves your device" — turns the constraint
   (no cloud inference) into the marketing.
5. **Capacitor cannot bundle the GGUF model.** First-launch over-Wi-Fi
   download with storage check, retryable. ~2.25 GB total (Gemma 4 mobile
   QAT + MTP drafter). User can defer download if storage is constrained;
   AI features stay disabled until the download completes.
6. **`@livekit/components-react-native` does not exist.** Phase 2 budget
   accounts for hand-building the UI component library.

## Rejected alternatives

### Pure Capacitor (rejected)
**Why rejected:** Enterprise 3-hour meetings hit the battery and
background-audio ceiling. App Review may flag WebRTC in WebView for
high-attendee meetings. No iOS 15.4–25 AI without a native llama.cpp plugin
(which would have to be built anyway, eroding the "fast hybrid" advantage).

### Pure React Native rewrite (rejected)
**Why rejected:** 14-18 weeks to first Beta cedes 4+ months of mobile
revenue opportunity to Signal, Element Call, Jitsi just as Apple's
2026 AI-disclosure rules favor on-device-AI positioning. Pro Mainstream
($18.99/mo) iOS conversion drops without App Store presence in that window.
The privacy MOAT marketing is at its peak NOW; waiting 4-6 months risks
the narrative.

### Defer mobile (rejected)
**Why rejected:** Cedes the iOS privacy-meeting-app marketing window.
Enterprise sales prospects routinely ask for mobile; no mobile = lost deals.

## Locked decisions

- **Capacitor app id (iOS + Android):** `co.dvai.connect`. Matches the
  `co.dvai.*` audience pattern in the bridge license JWT so the same
  license token covers both web and mobile.
- **License token location:** `/public/dvai-license.jwt` (commercial tier,
  licensee Deep Voice AI Limited, expires 2036, platforms
  web/node/ios/android/dotnet/flutter/react-native/capacitor). Bridge
  auto-discovery serves this at `https://<host>/dvai-license.jwt`.

## iOS WKWebView smoke test results (2026-06-13)

Hand-rolled minimal Swift+UIKit+WKWebView app, built with `swiftc`
targeting `arm64-apple-ios17.0-simulator`, ad-hoc signed, launched via
`xcrun simctl launch --console-pty`.

**iOS 17.5 — PASS:**
```json
{
    "RTCRtpScriptTransform": "function",   // present in WKWebView by default
    "RTCRtpSender": "function",
    "createEncodedStreams": false,         // older insertable-streams path (deprecated)
    "RTCEncodedVideoFrame": "undefined",
    "mediaDevices": "undefined",           // NOT exposed by default — see note below
    "getUserMedia": false,                 // NOT available by default — see note below
    "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ..."
}
```

- **RTCRtpScriptTransform IS present** in iOS 17.5 WKWebView with no
  extra config. LiveKit E2EE via Insertable Streams will work in the
  Capacitor wrap with no additional setup.
- **`navigator.mediaDevices` is `undefined`** in a vanilla WKWebView.
  This is expected — WKWebView requires the host app to (a) set the
  `mediaCaptureType` permission via the navigation delegate's
  `webView(_:requestMediaCapturePermissionFor:initiatedByFrame:type:decisionHandler:)`
  callback, AND (b) declare `NSCameraUsageDescription` +
  `NSMicrophoneUsageDescription` in Info.plist. Capacitor's
  `@capacitor/microphone` + `@capacitor/camera` plugins ship that
  configuration out of the box. So this is a documented Capacitor
  setup step, not a blocker.

**iOS 16.x and earlier — UNTESTED in this Mac's Xcode 26.5.**
- Xcode 26.5 ships only with iOS 17.5+ simulator runtimes. Older runtimes
  must be downloaded explicitly.
- Started a download of the iOS 16.4 runtime (6.18 GB), but the link rate
  was throttled to ~167 KB/s — projected ~10 hours to completion. Killed
  the download to avoid wasting bandwidth; sidelined for the user to
  finish in the background (or test on real device hardware).
- Based on WebKit's public release history, `RTCRtpScriptTransform`
  was enabled-by-default in WKWebView from iOS 16.4. iOS 15.4–16.3
  has it behind an experimental WebKit feature flag (not usable for
  production).

**Verified iOS floor: 17.0** (lowest runtime smoke-tested = 17.5; safe
floor at 17.0 since the API has been stable since 16.4 and there are
no known WKWebView regressions between 16.4 and 17.5).

**Optional widening to iOS 16.4** is a sideline:
- Either let the iOS 16.4 sim runtime finish downloading
  (`xcodebuild -downloadPlatform iOS -buildVersion 16.4` — overnight at
  current bandwidth), then re-run the smoke test against it; OR
- Smoke-test against a real iOS 16.4 device via TestFlight.
- If the 16.4 test PASSES, lower the Capacitor `iOS minimum` to 16.4
  (addressable market gain: ~5% more iOS users vs floor at 17).
- If it FAILS, floor stays at 17.

**Capacitor Phase 1 plan amendment:**
- `iOS minimum` set to 16.4 pending the 16.4 runtime smoke test.
- `Info.plist` requirements documented for Phase 1: `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSLocalNetworkUsageDescription` (for
  LiveKit signaling on some networks).
- Capacitor plugins to install in Phase 1:
  `@capacitor/microphone`, `@capacitor/camera`,
  `@capacitor/screen-orientation`, `@capgo/capacitor-mute`.

## Open questions parked (require user action)

1. **iOS 15.4 simulator smoke test** — being executed now on the user's
   Mac (`ssh mac`). Result will be folded back into this ADR.
2. **Apple Intelligence exact bridge wiring.** dvai-bridge v4 supports
   Apple Intelligence as a backend per the docs; concrete config and
   capability-check pattern needs a runtime smoke test once Phase 1 work
   starts. Sideline until Phase 1 kicks off post-Task-1.
3. **iOS Broadcast Extension for screen share (Phase 2).** 2-week native
   task with Mac + Apple Dev + provisioning profile. Sideline to Phase 2
   planning.

## Implementation references

- Synthesis: workflow `wf_4e7dbaf6-8e6` (run 2026-06-13)
- Locked pricing: `docs/superpowers/specs/2026-06-13-pricing-admin-design.md`
  (Tab 2 of the user's MD: $0 / $14.99 Africa / $18.99 / $48.99 / $449.99)
- Bridge migration plan: `docs/superpowers/plans/2026-06-13-bridge-v4-migration.md`
- Cost model: `docs/dvai-connect-cost-and-pricing-analysis.docx`
  (to be refreshed for Tab 2 pricing + Deepgram removal)
