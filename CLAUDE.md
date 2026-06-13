# DVAI Connect — agent notes

> Last refresh: 2026-06-14. This file is for any future Claude session
> working in this repo. Read top-to-bottom on first invocation, then
> only re-check sections you're about to touch.

## What this is

DVAI Connect is a Next.js video-meeting app built on LiveKit, with
on-device AI (Gemma 4 via `@dvai-bridge/*`) for transcription + agent
features. The privacy MOAT is "audio and video never leave the device
for transcription or AI processing." Cloud recording is opt-in,
clearly disclosed, and uses server-side encryption at rest (not E2EE).

## Pricing — locked (Tab 2, 2026-06-13)

| Tier            | USD/mo     | Sales motion     | Per-org or per-member |
| --------------- | ---------- | ---------------- | --------------------- |
| Free            | 0          | self-serve       | n/a                   |
| Pro (Africa)    | 14.99      | cohort-restricted| per member            |
| Pro             | 18.99      | self-serve       | per org               |
| Business        | 48.99      | sales-assisted   | per org               |
| Enterprise      | 449.99     | sales-led        | per org (annual)      |

Behavior, caps, gates: `lib/pricing/tiers.ts` (single source of
truth). Editable display copy: `pricing_tiers` Appwrite collection,
merged at render time via `lib/pricing/overrides.ts`. Stripe price
ids: env vars listed in `lib/pricing/stripe-config.ts`.

Africa cohort gets a 24-month commitment via Stripe Subscription
Schedules. Enforcement is four-layer: (1) the Schedule with
`duration: { interval: 'month', interval_count: 24 }`, (2) Africa-only
Customer Portal config with cancel + plan-change disabled, (3) app-
side detection in `/api/portal` that routes Africa users to that
locked config, (4) the daily drift cron `/api/cron/audit-stripe-config`.

## Transcription floor

Deepgram + any other cloud STT has been **removed entirely** as of
2026-06-13. The transcription tier system is:

- Tier 1: Local Whisper via `@dvai-bridge/core` transformers backend
  (`onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` on web; LiteRT-LM
  or Apple Intelligence on mobile per the ADR).
- Tier 2: Web Speech API universal fallback. Fires a one-time
  in-app notice on first use ("can't run on-device — quality may
  be reduced — we don't fall back to cloud").
- Tier 3: OFF with an in-settings explainer.

Code lives in `lib/transcription/`. `lib/auth/subscription.ts` is
async on the server and **must not** be called from
`lib/transcription/strategy.ts` (which runs in the browser without
a user context).

## Auth + session

Two-tier auth model:

- **Appwrite browser SDK** keeps the session on the Appwrite endpoint
  domain (e.g. `api.mega-voice-command.com`). Used in `AuthProvider`
  for client-side queries (`account.get()`, prefs, etc.).
- **JWT bridge** (`/api/auth/sync` + `lib/auth/session.ts`) sets a
  `dvai_session` HttpOnly cookie on **our** domain with a 15-minute
  Appwrite JWT. Server components, `/api/*` routes, and `proxy.ts`
  authenticate against this cookie via `setJWT()`. AuthProvider
  refreshes it every 13 minutes.

Don't try to read `a_session_<project>` server-side — that cookie
lives on a different domain and won't be visible.

Three-layer admin RBAC:

1. `proxy.ts` — edge runtime, cookie-presence check only.
2. `app/admin/layout.tsx` — server component, calls `requireAdmin()`.
3. `app/api/admin/*` handlers — call `requireAdminInTeam(teamId)`.

`requireAdmin` honors the Appwrite account-level `admin` **label**
as a platform-staff master bypass, AND per-team admin/owner roles
via `lib/auth/role.ts`. Add labels in Appwrite Console → Auth →
user → Labels.

## Stripe wiring (sandbox today)

Setup script: `scripts/stripe-setup-2026-06-13.mjs` — idempotent;
creates products, prices, meters, portal configs.

Runtime contract:

- `STRIPE_RESTRICTED_KEY` (rk_…) — preferred runtime key. Scope it
  to the operations listed in the script's header comment.
- `STRIPE_SECRET_KEY` (sk_…) — only used by the setup script.
- `STRIPE_WEBHOOK_SECRET` — verifies incoming webhook signatures.

Event flow:

```
Stripe → /api/webhooks/stripe (ack-fast, dedupe by eventId, persist raw payload)
        → stripe_events Appwrite collection
                ↓ every 1 min
                /api/cron/process-stripe-events (drain & apply)
                → subscriptions Appwrite collection
                → (Africa only) wraps subscription in a 24-month Schedule
```

Metered billing fires from `/api/livekit/webhook` on `room_finished`
(Business hourly overage) and `participant_joined` (Enterprise
concurrent big-room ≥ 1000 attendees). Both use Stripe's
`identifier` param for idempotency.

## Crons

Run inside the app via `workers/cron.mjs` (PM2-managed). Routes:

- `* * * * *` → `/api/cron/process-stripe-events`
- `0 9 * * *` → `/api/cron/audit-stripe-config`

Both require `Authorization: Bearer $CRON_SECRET`. Local dev can set
`CRON_SECRET_DEV_BYPASS=1` to skip the header.

Don't use module-scope `setInterval` inside Next.js — App Router has
no server boot hook that fires exactly once.

## Self-hosted LiveKit

Production runs the user's own LiveKit server (not LiveKit Cloud).
Webhook setup is in the server's `livekit.yaml`:

```yaml
webhook:
  api_key: <same key the app uses to mint participant tokens>
  urls:
    - https://connect.deepvoiceai.co/api/livekit/webhook
```

Enterprise customers get **real per-customer LiveKit nodes**, not
labeled-shared-with-quota. Provisioning runbook:
`docs/runbooks/enterprise-livekit-provisioning.md`.

## Important conventions

- **No emoji unless the user explicitly asks.** Anywhere — comments,
  console logs, UI copy.
- **Don't add comments that just describe what the code does.**
  Comments should capture *why*, not *what*.
- **Marketing pages (`/pricing`, `/pricing/africa`, `/signup`,
  `/billing`, `/checkout/success`, `/forgot-password`,
  `/reset-password`, `/verify-email`) use `h-full overflow-y-auto`**
  on their outermost div to override the global `PageTransition`
  wrapper's `overflow-hidden`. Meeting room pages keep no-scroll.
- **Tailwind + Framework7-style layouts coexist.** Don't import the
  full Tailwind bundle (`@import 'tailwindcss'`); use
  `@import 'tailwindcss/theme'` + `@import 'tailwindcss/utilities'`.
  See the global preferences in `~/.claude/CLAUDE.md`.
- **node-cron** runs in `workers/cron.mjs` (separate PM2 process),
  not in the Next.js app.
- **Tests:** `pnpm test` runs vitest. `lib/stubs/server-only.ts`
  stubs out the `server-only` package so server modules import
  cleanly in node-only test runs.

## Common gotchas

- Stripe Node SDK v22 with API `2026-05-27.dahlia`:
  - `Subscription.current_period_*` moved to
    `SubscriptionItem.current_period_*` (each item now has its own
    billing period).
  - `Invoice.subscription` moved to
    `Invoice.parent.subscription_details.subscription` (gated on
    `parent.type === 'subscription_details'`).
  - `SubscriptionSchedule.Phase.iterations` replaced by
    `Phase.duration: { interval, interval_count }`.
  - `ui_mode` accepts `embedded_page`, not `embedded`.
- Next.js 16 uses `proxy.ts` instead of `middleware.ts`. Both
  cannot coexist; the build fails.
- Appwrite `createBooleanAttribute`: `required: true` AND a default
  value are mutually exclusive (the API rejects the combo). The
  helper `boolAttr` in `scripts/appwrite-migrate-2026-06-13.mjs`
  throws an explicit error if you mix them.
- `useSearchParams()` from `next/navigation` requires a
  `<Suspense>` boundary at the route's export root in Next 16.

## Files you'll edit most

- `lib/pricing/tiers.ts` — when pricing or feature flags change.
- `lib/pricing/stripe-config.ts` — when adding new Stripe price ids.
- `scripts/appwrite-migrate-*.mjs` — when adding collections /
  attributes. Each migration is dated; add new ones, don't edit
  past ones.
- `scripts/stripe-setup-2026-06-13.mjs` — when adding new Stripe
  products / portal configs.
- `lib/auth/admin.ts` + `lib/auth/role.ts` — RBAC rules.
- `app/api/livekit/webhook/route.ts` — meter firing logic.
- `lib/stripe-events/handlers.ts` — what we do per Stripe event.

## Reference docs in-repo

- Spec: `docs/superpowers/specs/2026-06-13-pricing-admin-design.md`
- Plan: `docs/superpowers/plans/2026-06-13-pricing-admin.md`
- Mobile ADR: `docs/superpowers/specs/2026-06-13-mobile-strategy-adr.md`
- Cost update: `docs/2026-06-13-cost-analysis-update.md`
- Enterprise provisioning: `docs/runbooks/enterprise-livekit-provisioning.md`
