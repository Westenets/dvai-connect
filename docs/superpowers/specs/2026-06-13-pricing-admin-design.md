# Pricing UI + Subscription Backend + Admin Panel — Design Spec

**Status:** Locked. Ready for implementation planning.
**Owner:** Deep + Claude (research synthesis 2026-06-13, adversarial-verified)
**Supersedes:** `docs/superpowers/specs/2026-04-30-payments-strawman.md`
**Companion docs:**

- Mobile strategy ADR: `docs/superpowers/specs/2026-06-13-mobile-strategy-adr.md`
- Bridge v4 migration plan: `docs/superpowers/plans/2026-06-13-bridge-v4-migration.md`
- Cost analysis: `docs/dvai-connect-cost-and-pricing-analysis.docx` (refresh pending)

---

## 1. Goals

1. Implement the locked Tab 2 pricing (Free / Pro Africa / Pro Mainstream /
   Business / Enterprise) end-to-end: public pricing page, embedded Stripe
   checkout, webhook-driven subscription state, customer portal.
2. Build a multi-org primitive (Appwrite Teams) so we can scale to multi-
   member organizations from day one without re-architecture.
3. Build a generic **organization / signup-code** mechanism so cohort
   programs (Africa SAV/BAM/PAIN/TEF, future partner cohorts) can be
   created by admins, distributed as signed URLs, and validated server-side
   at signup. Seat-cap enforcement closes the cohort-bypass risk.
4. Build the admin panel: Pricing CRUD (display fields), Organizations CRUD,
   Recording Browser (bypasses participant filter), Active Rooms monitor
   (LiveKit webhooks + Appwrite Realtime), Participant Data (signaling only,
   per E2EE constraints), Branding (org_branding).
5. Add the missing paid-feature gates that were never wired: agent
   dispatch, recording start/stop, participant-cap-at-join.
6. Refresh `isPaidUser()` from the v1 stub to a real async read from
   Appwrite subscription state, hydrated synchronously through AuthProvider
   context for React consumers.

## 2. Pricing — LOCKED (Tab 2 of the user's MD)

Five SKUs. Flat per organization (NOT per-seat) for Pro Mainstream / Business
/ Enterprise. Pro Africa is **$14.99 per member** (per-user subscription).
No Team tier.

| SKU            | Price                | Length                                          | Attendees | Recording | Agent | Notetaking | Screen | Notes                                                                                                                                                                     |
| -------------- | -------------------- | ----------------------------------------------- | --------- | --------- | ----- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free           | $0                   | 40 min                                          | 10        | ❌        | ❌    | ❌         | ✅     | E2EE on                                                                                                                                                                   |
| Pro Africa     | $14.99 / mo / member | 1 hr                                            | 100       | ✅        | 1     | ✅         | ✅     | 24-mo commit, no annual disc., cohort-gated. Each member has own Stripe subscription.                                                                                     |
| Pro Mainstream | $18.99 / mo / org    | 1 hr                                            | 100       | ✅        | 1     | ✅         | ✅     | Single Stripe subscription per org.                                                                                                                                       |
| Business       | $48.99 / mo / org    | 1 hr (+$35/hr blocks, admin-modifiable)         | 300       | ✅        | 1     | ✅         | ✅     | + Custom Branding + Admin Dashboard.                                                                                                                                      |
| Enterprise     | $449.99 / mo / org   | 3 hr (overage admin-modifiable, default $35/hr) | 1000      | ✅        | 1     | ✅         | ✅     | + Dedicated LiveKit Node + Partitioned Data Security + 24/7 Support + Custom Branding + Admin Dashboard. **+ admin-modifiable fee per concurrent 1000-attendee session.** |

### 2.1 Hero copy (public pricing page)

> **End-to-end encryption on every plan, including Free.**
> We cannot see what's said in your meetings.

(VAD signals via RTP header extensions stay on for the "who's speaking"
indicator — the softened copy "what's said" instead of "what's in" preserves
truthfulness.)

### 2.2 Recording-vs-E2EE disclosure (load-bearing, must appear with every recording mention)

> **Cloud recording uses server-side encryption (not end-to-end).**
> Recordings are encrypted at rest with platform-managed keys. Live audio
> and video remain end-to-end encrypted during the meeting; only the
> recording artifact is server-decrypted to be processed by our recorder
> and re-encrypted for storage. Our employees do not access the content.

This copy is non-negotiable. Without it, the E2EE-in-every-tier claim
becomes legally exposed to FTC deceptive-practice and EU GDPR DPO complaints.

**Future work (parked):** Two recording alternatives that would preserve true
E2EE were considered:

- **Per-participant local MediaRecorder recording.** Each participant
  records their own outgoing + incoming streams locally, saves to
  IndexedDB or downloads. Pros: true E2EE. Cons: per-participant
  perspective, mobile storage, complex reassembly, missing late-joiner
  segments. **Defer to v2.**
- **Customer-managed encryption keys (BYOK).** Customer provides
  encryption key at recording time, we encrypt and never store the key.
  Pros: true zero-knowledge. Cons: complex UX, key loss = data loss.
  **Reserve for Enterprise tier as a Phase 2 feature; v1 ships with
  platform-managed keys only.**

## 3. Architecture

### 3.1 Org primitive: Appwrite Teams

Each paying SKU = one Appwrite Team. Team membership roles:

- **owner** (1 per team, the Stripe billing contact)
- **admin** (can access `/admin`)
- **member**

Stripe Customer maps 1:1 to Team via `stripeCustomerId` on the
`subscriptions` row. For Pro Africa, each member has their own Stripe
Customer + Subscription (per-member billing) but they belong to the same
Team (org) for cohort identification.

### 3.2 Pro Africa per-member billing model (B2 — decided)

- An org (Team) is created by an admin in the admin panel with
  `tier_override = "pro_africa"`, `max_seats = 100`, and a generated
  `signup_code`.
- The org admin shares the signup URL `https://meet.deepvoiceai.co/signup?code=<code>`
  with cohort members.
- Each member visits the URL; the signup page reads `?code=` into a
  hidden input; on submit, the server validates the code, creates an
  Appwrite User, adds them to the Team as a member, AND creates a
  $14.99 Pro Africa Stripe subscription **for that user** (their own
  Customer + Subscription with a 24-month schedule).
- When `signup_count` reaches `max_seats`, the signup endpoint rejects
  new members with that code.
- The cohort partner pays nothing centrally; each member pays $14.99
  directly. Admin can raise `max_seats` later to authorize more
  signups.

### 3.3 Mainstream / Business / Enterprise billing model

- An org (Team) is created by the org owner via Stripe Checkout (any user
  can become an owner by initiating a checkout flow on the public
  pricing page).
- ONE Stripe subscription per org. All members of the Team get plan
  features when they're authenticated and active in a meeting hosted
  by an org owner.
- Org owner uses Customer Portal to upgrade / downgrade / cancel /
  update payment method.
- Org owner invites additional members via Appwrite Teams invite flow
  (free, no extra billing per member).

### 3.4 Enterprise dedicated LiveKit node (per Tab 2 + user clarification)

- Each Enterprise customer gets a **real per-customer LiveKit deployment**
  (not a labeled-shared-with-quota-guarantee v1 hack).
- Provisioning is **manual ops** for v1 (the Enterprise sales cycle is
  3-9 months; manual provisioning is acceptable at expected volume of
  1-10 Enterprise customers in year 1).
- v2 work: automation via Terraform/Pulumi to spin a Hetzner CCX53
  32-core node with LiveKit pre-configured. Tracked separately as a
  Phase 2 Enterprise feature.
- Cost implication: each Enterprise customer = $250+/month real
  infrastructure cost. Margin on Enterprise tier drops to ~45% (still
  healthy; the absolute dollar margin remains strong).

### 3.5 Transcription tier system (Deepgram removed)

Following the 2026-06-13 decision to remove Deepgram entirely:

- **Tier 1 — Local Whisper** via `@dvai-bridge/core` transformers backend
  (`onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` on web; LiteRT-LM
  or Apple Intelligence on mobile per the ADR).
- **Tier 2 — Web Speech API** universal fallback. Triggers an in-app
  notification on first use:
    > _"Your device can't run our on-device speech recognition. We've
    > switched to the browser's built-in speech API for this call.
    > Transcription quality and meeting intelligence may be reduced.
    > We don't fall back to the cloud — that would break our privacy
    > promise."_
- If neither viable, transcription is **OFF** with a settings explainer.
- The previously-shipped "Improve transcript quality" button on the
  recording detail page is **removed**. Re-transcription as a paid
  feature is deferred to a future spec.

## 4. Public pricing page (`/pricing`)

### 4.1 Route

`app/pricing/page.tsx` as a server component for SEO. Reads from
`lib/pricing/tiers.ts` (single source of truth, also consumed by the
admin Pricing CRUD).

### 4.2 Layout

- Hero (privacy MOAT copy per §2.1).
- 4-tier visible comparison table: Free / Pro Mainstream / Business / Enterprise.
- Pro Africa is **HIDDEN** behind eligibility (separate route at
  `app/pricing/africa/page.tsx`, accessible only via signed invite URL).
- Comparison rows: meeting length, attendee cap, cloud recording, meeting
  agent quota, notetaking, screen share, custom branding, admin dashboard,
  dedicated infrastructure, support SLA, **E2EE (checkmark on every row,
  prominent)**.
- Disclosure banner immediately above the Recording row: copy per §2.2.
- FAQ section addressing E2EE-vs-recording tradeoff, "Dedicated Node"
  meaning, Enterprise concurrent-big-room fee, Business hourly overage,
  why no annual discount on Pro Africa.

### 4.3 Checkout

- Each tier card has a CTA that calls a Server Action
  `createCheckoutSession(priceId)` returning a `clientSecret`.
- Renders Stripe `EmbeddedCheckoutProvider` + `EmbeddedCheckout` in a
  Drawer/modal on the same page (no off-domain redirect).
- **COOP/COEP relaxation required for the `/pricing` route** —
  Stripe's iframe is blocked by the global `Cross-Origin-Opener-Policy:
same-origin` + `Cross-Origin-Embedder-Policy: credentialless` headers.
  Add per-route header override in `next.config.js`.
- Pro Africa cohort signups use Stripe **Hosted Checkout** (separate
  redirect flow, lower volume, simpler error handling). The URL is
  generated server-side after cohort eligibility is verified.

### 4.4 Signup with code (NEW flow)

For Pro Africa and any future cohort program:

1. Admin generates an org in the admin panel; system creates a `signup_code`
   (e.g., `AFRIKA-SAV-2026-X7K9`).
2. Share URL pattern: `https://meet.deepvoiceai.co/signup?code=AFRIKA-SAV-2026-X7K9`
3. Signup page (`app/signup/page.tsx`):
    - Reads `code` from `searchParams` server-side.
    - Stores in a **hidden** `<input type="hidden" name="cohortCode" />`
      (NOT editable, NOT visible to user).
    - On form submit, the Server Action validates the code against
      the `organizations` collection: must be `is_active`, not expired,
      `signup_count < max_seats`.
    - On success:
        - Creates Appwrite User.
        - Adds user to the org's Team as `member` role.
        - For Pro Africa: creates per-member Stripe Customer + Subscription
          with 24-month schedule.
        - Increments `signup_count` atomically.
        - Redirects to onboarding or post-checkout success.
    - On failure: clear error ("This invite link is no longer valid")
      without leaking why (active vs expired vs full — anti-enumeration).

## 5. Subscription backend

### 5.1 Appwrite collections (NEW)

**`subscriptions`**

- `$id`, `userId` (indexed), `orgId` (indexed, FK to Teams)
- `stripeCustomerId` (unique index), `stripeSubscriptionId` (unique index)
- `stripeScheduleId` (nullable, for Pro Africa 24-mo schedule)
- `tier` (enum: `free` | `pro_africa` | `pro` | `business` | `enterprise`)
- `status` (enum: `active` | `past_due` | `canceled` | `trialing` | `incomplete` | `unpaid`)
- `currentPeriodStart` (datetime), `currentPeriodEnd` (datetime)
- `cancelAtPeriodEnd` (bool)
- `isAfricaCohort` (bool, default false)
- `africaCohortCode` (string, nullable — `SAV` | `BAM` | `PAIN` | `TEF` | extensible)
- `africaCommitmentEnd` (datetime, nullable — 24mo from start for Africa)
- `priceId` (string — Stripe Price ID snapshot for analytics)
- `createdAt`, `updatedAt`

**`stripe_events`** (webhook idempotency log)

- `$id` = Stripe event id (unique PK)
- `type` (e.g., `customer.subscription.updated`)
- `payload` (string, JSON)
- `processed` (bool)
- `processedAt` (datetime, nullable)
- `error` (string, nullable)
- `createdAt`

**`organizations`** (the generic cohort/code primitive)

- `$id`, `appwriteTeamId` (unique idx)
- `name`, `country`, `program_name` (string — e.g., `SAV`, freeform for extensibility)
- `signup_code` (unique idx, URL-safe random string)
- `tier_override` (enum nullable — e.g., `pro_africa`; when set, members
  who sign up via this code get this tier instead of choosing one)
- `commitment_months` (int, nullable — 24 for Pro Africa)
- `max_seats` (int, default 0 = unlimited)
- `signup_count` (int, default 0)
- `expires_at` (datetime, nullable)
- `is_active` (bool, default true)
- `primary_contact_name`, `primary_contact_email`
- `billing_contact_email`
- `notes` (string, free text for admin context)
- `createdBy` (admin user id)
- `createdAt`

**`active_rooms`** (mirrored from LiveKit webhooks for admin live monitor)

- `$id` = roomSid (unique PK)
- `roomName`, `createdAt`
- `creatorOrgId` (indexed)
- `participantCount`
- `isRecording` (bool)
- `region`
- `lastEventAt`

**`session_logs`** (per-join audit — IP + UA capture)

- `$id` = sessionId (unique)
- `identity` (Appwrite userId), `orgId`
- `ip` (from `x-forwarded-for` at `/api/connection-details`)
- `userAgent`
- `joinedAt`, `leftAt` (nullable)
- `roomSid` (indexed)

**`org_branding`** (Business+ custom branding)

- `$id` = appwriteTeamId
- `logoUrl`, `primaryColor`, `accentColor`, `darkLogoUrl`
- `customDomain` (nullable, Enterprise only)
- `loginScreenCopy` (nullable)
- `emailFromName`, `emailFromAddress`

### 5.2 Stripe Checkout (embedded)

Server Action `lib/actions/stripe.ts > createCheckoutSession(priceId, options)`:

- `ui_mode: 'embedded'`
- `mode: 'subscription'`
- `customer = existing stripeCustomerId or creates new with metadata { appwriteUserId, appwriteTeamId }`
- `automatic_tax: { enabled: true }`
- `tax_id_collection: { enabled: true }` (B2B reverse charge)
- `return_url: '/billing/return?session_id={CHECKOUT_SESSION_ID}'`

### 5.3 Customer Portal

Server Action `createPortalSession()` returns `session.url`:

- Pro Africa cohort customers: pass `configuration = STRIPE_PORTAL_CONFIG_AFRICA`
  (configured in Stripe Dashboard to hide cancel feature).
- Everyone else: default config.

### 5.4 Webhook handler

`app/api/webhooks/stripe/route.ts`:

- `export const runtime = 'nodejs'`
- Reads body via `req.text()` (NOT `req.json()` — would corrupt signature).
- Verifies via `stripe.webhooks.constructEvent`.
- Inserts into `stripe_events` keyed on `event.id` (unique constraint =
  idempotency).
- Returns **200 immediately** (<100ms). Side-effects happen via Vercel Cron.
- 5 critical events: `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`.

`app/api/cron/process-stripe-events/route.ts` (Vercel Cron, every 1 min):

- Drains unprocessed `stripe_events`.
- Updates `subscriptions` row.
- Marks event as `processed`.

### 5.5 Pro Africa 4-layer commitment lock

1. **Stripe subscription schedule** — `subscriptionSchedules.create` with
   Phase 1 = 24 monthly iterations at $14.99, Phase 2 = indefinite monthly.
   `end_behavior: 'release'`.
2. **Stripe Customer Portal config** — `STRIPE_PORTAL_CONFIG_AFRICA` env
   var points at a portal configuration with `subscription_cancel`
   disabled. **Pre-create in Stripe Dashboard at setup time (sidelined).**
3. **Server-side cancel guard** — any custom cancel endpoint
   (`/api/billing/cancel`) checks `africaCommitmentEnd > now` and rejects.
4. **Daily Vercel Cron drift detection** — `app/api/cron/audit-stripe-config/route.ts`
   re-asserts the portal configuration via Stripe API to detect drift.
   Catches the case where someone toggles the portal config off in the
   Dashboard.

### 5.6 Seat-cap enforcement (closes cohort bypass)

The `organizations.max_seats` field, enforced atomically at signup-code
validation time, is the primary defense:

- New member submits signup form with `?code=...`
- Server reads `organizations` row WHERE `signup_code = code AND is_active = true`
- Server checks `signup_count < max_seats` (if `max_seats > 0`)
- If pass, atomically: `INSERT user + ADD to team + CREATE Stripe sub +
INCREMENT signup_count`. Race-protected via Appwrite document
  conditional update (`If-Match` on document `$updatedAt`).
- If fail (no seats), return 403 with anti-enumeration error.

This closes the bypass because: even if a former cohort member creates
a new Appwrite account, the signup code's `max_seats` is reached and
they can't sign up. Admin can raise the cap to authorize more, but the
admin can also revoke `is_active` on a code to stop all new signups.

### 5.7 Business hourly overage meter

Stripe Billing Meter `business_extra_hours`:

- Fires at meeting-end webhook handler when `meeting_duration_minutes > 60`
  on a Business subscription.
- Computes `extra_hours = Math.ceil((duration_minutes - 60) / 60)`.
- Fires `extra_hours` meter events with identifier
  `roomSid:hour:{1..extra_hours}` for retry-safety.
- Tied to metered price item — admin-modifiable rate (default $35/hr,
  editable from admin Pricing CRUD).

### 5.8 Enterprise concurrent big-room meter

Stripe Billing Meter `concurrent_big_room_session`:

- Fires from `app/api/livekit/webhook/route.ts` on `participant_joined`
  when `participant_count` crosses 1000 for the first time in that session.
- Idempotency key: `roomSid:sessionId` — fires ONCE per session that
  ever crossed 1000.
- Tied to metered price item — admin-modifiable rate (default TBD,
  editable from admin Pricing CRUD).

## 6. Admin panel

### 6.1 Layout

`app/admin/*` with three-layer RBAC defense:

1. **Middleware** (`middleware.ts`) — verifies session cookie, redirects
   unauthenticated to `/login`.
2. **Layout** (`app/admin/layout.tsx`) — server component, calls
   `requireAdmin()` from `lib/auth/admin.ts` which checks Appwrite Team
   membership for the admin role. Redirects non-admins to `/`.
3. **Route handler** (`app/api/admin/**/route.ts`) — every admin API
   call independently checks `requireAdmin()`.

### 6.2 Pricing CRUD (`/admin/pricing`)

Reads from `lib/pricing/tiers.ts` (single source of truth, shared with
public `/pricing`).

Editable from admin:

- Display name, marketing badges (e.g., "Best value")
- Feature checkmarks (display in comparison table)
- Description / FAQ copy
- Stripe `priceId` mapping (with confirm dialog — assigns existing tier
  to a new Stripe price; old subscriptions on the old priceId are
  unaffected, new signups use the new priceId)
- Business hourly overage rate (default $35)
- Enterprise hourly overage rate (default $35)
- Enterprise concurrent big-room fee rate

NOT editable from admin (managed in Stripe Dashboard):

- Base subscription price ($0 / $14.99 / $18.99 / $48.99 / $449.99) —
  Stripe doesn't allow editing active prices; admin's "edit price"
  flow creates a new Stripe Price and swaps the mapping. Old
  subscriptions stay on the old price until renewal.

KPI cards (Tremor): MRR per tier, paid customer count per tier,
churn rate.

### 6.3 Organizations CRUD (`/admin/organizations`)

For the cohort / signup-code mechanism.

- List view: org name, country, tier_override, program_name, signup_code,
  signup_count / max_seats, is_active, expires_at, created_at.
- Create form: all `organizations` fields editable.
- Detail view: list of members who signed up with this code (joins
  `subscriptions` on `africaCohortCode`).
- Actions per row: regenerate signup_code, disable (set `is_active = false`),
  delete (soft-delete; preserves audit trail), copy share URL to
  clipboard.

### 6.4 Recording Browser (`/admin/recordings`)

- Server route `GET /api/admin/recordings` replicates the user-facing
  list query but bypasses `Query.contains('participant_ids', user.$id)`.
- Filters: org/team, room name, started_by, date range, status, duration.
- Per-recording detail: roomName, egress_id, status, started_by (resolved
  to user identity), participant_ids (resolved to identities),
  file_name, recording_url, thumbnail, fileSize, duration.
- Admin actions: download original MP4 (Appwrite Storage signed URL),
  delete recording (existing pattern), force-stop in-progress egress.
- Storage growth chart (Tremor AreaChart of `sum(file_size)` over time
  grouped by week).
- TanStack Table v8 for the list (headless, no preflight risk).

### 6.5 Active Rooms Monitor (`/admin/rooms`)

Hybrid approach: LiveKit webhook → `active_rooms` collection → Appwrite
Realtime subscription on the client. 5s polling fallback.

- New endpoint `app/api/livekit/webhook/route.ts` registered in
  self-hosted LiveKit. Listens for:
    - `room_started` / `room_finished` → upsert `active_rooms`
    - `participant_joined` / `participant_left` → update
      `participantCount` + fire concurrent-big-room meter at 1000 threshold
    - `egress_started` / `egress_ended` → update `isRecording`
- Client at `/admin/rooms` subscribes via Appwrite Realtime.
- Per-room drill-down at `/admin/rooms/[roomSid]` shows participant table
  via `GET /api/admin/rooms/{roomSid}/participants` which calls
  `roomService.listParticipants()`.

#### Participant table fields

(All available from LiveKit signaling + our token endpoint instrumentation;
NONE require breaking E2EE.)

- identity (Appwrite userId)
- name (resolved via `Users.get`)
- email (admin only, gated; only for users in same org — see §6.6)
- joined_at / left_at
- state (`JOINING` | `JOINED` | `ACTIVE` | `DISCONNECTED`)
- kind (`STANDARD` | `AGENT` | `SIP` | `EGRESS` | `INGRESS`) — badges
- region (LiveKit edge)
- SDK + version + OS + browser (from `ClientInfo` captured at token endpoint)
- IP address (from `x-forwarded-for` at `/api/connection-details` →
  stored in `session_logs`; NOT in `ParticipantInfo`)
- Per-track: codec, resolution, simulcast layers, source, mute, **encryption type (`NONE` | `GCM` | `CUSTOM`)** — surface as "E2EE verified" badge per track
- Connection quality (RTT, jitter, loss) if self-hosted Prometheus reachable
- disconnect_reason on departure
- Participant metadata (plan tier, orgId) and attributes (`hand_raised`, etc.)

#### Admin actions per room

- End for everyone (`roomService.deleteRoom`)
- Force-stop recording (`egressClient.stopEgress`)
- Kick participant (`roomService.removeParticipant`)

All gated by: `isOrgAdmin AND (room creator's orgId === acting admin's orgId)`.
Cross-org guests (external attendees from a different org) appear in the
participant list with identity + name only — no email exposed.

#### Disclosure banner (pinned to top of room views)

> _You can see who joined and when, but not what they said. End-to-end
> encryption is on by default for every plan._

### 6.6 Email visibility under E2EE (GDPR-aware)

- Admin sees email for users **in their own org only** (consent
  captured at org-join via Team invite acceptance terms).
- External (cross-org) guests appear with identity + display name only.
- Org-join Terms of Service include the email-visible-to-org-admin
  consent. Legal review required before launch.

### 6.7 Branding (`/admin/branding`)

For Business + Enterprise. Reads/writes `org_branding`:

- Logo upload (light + dark variants)
- Primary color, accent color (CSS-variable theming in client)
- Custom domain (Enterprise only — requires DNS verification flow)
- Login screen copy override
- Outbound email "From" name and address

## 7. Integration points (files touched)

### 7.1 New files

- `lib/pricing/tiers.ts` — single source of truth
- `lib/auth/admin.ts` — `isOrgAdmin`, `requireAdmin`
- `lib/auth/role.ts` — role resolution from Team memberships
- `lib/auth/org.ts` — `getCurrentOrg`, `createOrg`, signup-code helpers
- `lib/actions/stripe.ts` — `createCheckoutSession`, `createPortalSession`
- `app/pricing/page.tsx`, `app/pricing/africa/page.tsx`
- `app/signup/page.tsx` (or modify existing) — adds hidden `cohortCode` input
- `app/api/pricing/africa-eligibility/route.ts` — JWT verification for cohort eligibility
- `app/api/webhooks/stripe/route.ts`
- `app/api/cron/process-stripe-events/route.ts`
- `app/api/cron/audit-stripe-config/route.ts` — daily drift detection
- `app/api/livekit/webhook/route.ts`
- `app/admin/layout.tsx`, `app/admin/page.tsx` (dashboard)
- `app/admin/pricing/page.tsx`
- `app/admin/organizations/page.tsx`, `app/admin/organizations/[id]/page.tsx`
- `app/admin/recordings/page.tsx`
- `app/admin/rooms/page.tsx`, `app/admin/rooms/[roomSid]/page.tsx`
- `app/admin/branding/page.tsx`
- `lib/components/admin/DataTable.tsx` — shared TanStack Table wrapper
- `lib/components/admin/KpiCard.tsx` — vendored Tremor-style card
- `app/api/admin/recordings/route.ts`, `app/api/admin/rooms/route.ts`,
  `app/api/admin/organizations/route.ts`

### 7.2 Modified files

- `components/AuthProvider.tsx` — hydrate subscription + org + role at
  login; expose via context
- `lib/auth/subscription.ts` — `isPaidUser()` async rewrite, add
  `getUserPlan()` async, add sync hydrated context
- `app/api/connection-details/route.ts` — add plan snapshot lookup +
  cap gate at join time; also write IP + UA to `session_logs`
- `app/api/record/start/route.ts`, `app/api/record/stop/route.ts` — add
  session-cookie auth; add per-org duration tracker for Business
  hourly meter
- `app/api/agent/route.ts` — add `isPaidUser` gate + concurrent agent
  quota check
- `app/api/transcription/cloud-token/route.ts` — **DELETE** (Deepgram removed)
- `lib/transcription/adapters/cloudSttAdapter.ts` — **DELETE**
- `lib/transcription/strategy.ts` — remove `cloud` tier; rewire
  fallback logic (Tier 1 Whisper → Tier 2 Web Speech, never cloud)
- `app/recordings/[id]/RecordingDetailClient.tsx` — remove "Improve
  transcript quality" button
- `app/settings/page.tsx` — remove "Cloud" option from transcription
  quality dropdown; add user notification on Web Speech fallback
- `lib/components/Header.tsx` — add `/admin` link in avatar dropdown
  when `isOrgAdmin AND plan ∈ {business, enterprise}`
- `next.config.js` — relax COOP/COEP for `/pricing` route only;
  CI lint regex blocking `@import 'tailwindcss'` in any `app/**/*.css`
- `lib/test/smokeSuite.ts` — add admin-panel smoke test; add
  `isE2EESupported()` boot check (preps for Phase 1 Capacitor)

### 7.3 Deleted files / cleanup

- `app/api/transcription/cloud-token/route.ts`
- `lib/transcription/adapters/cloudSttAdapter.ts`
- `app/recordings/[id]/...` — strip "Improve transcript quality" code
- `docs/superpowers/specs/2026-04-30-payments-strawman.md` →
  move to `docs/superpowers/specs/archive/` or add SUPERSEDED banner

## 8. Error handling and edge cases

### 8.1 Mid-meeting plan downgrade

Snapshot of creator's plan into `room_admins` at room-create wins for
the current meeting. Next meeting reads live state. Documented in
admin UI ("Plan changes apply to your next meeting").

### 8.2 Cross-org guests

External (cross-org) guests appear in the participant list with
identity + display name only — no email. Admin can still mute/remove
since the room is org-owned.

### 8.3 Recording mid-meeting plan change

If org downgrades from Business to Pro Mainstream mid-meeting and the
host had recording started, recording continues to end-of-meeting on
the original plan's terms. Next meeting respects the new plan.

### 8.4 Cohort code edge cases

- Expired code: reject with anti-enumeration error.
- Disabled (`is_active = false`) code: same anti-enumeration error.
- Exhausted seats: same anti-enumeration error.
- Reused code attempt by existing user: redirect to login.

### 8.5 Webhook delivery failures

- Stripe retries up to 3 days with exponential backoff. The
  `stripe_events` collection's unique constraint on `event.id` makes
  re-delivery idempotent.
- If a webhook is dropped entirely, the daily `audit-stripe-config`
  cron reconciles subscription state by polling `stripe.subscriptions.list`.

## 9. Testing strategy

### 9.1 Unit tests (vitest)

- `lib/pricing/tiers.ts` schema + tier-resolution rules
- `lib/auth/role.ts` role resolution from Team memberships
- `lib/auth/org.ts` signup-code validation + seat-cap atomic check
- `lib/actions/stripe.ts` checkout session creation (mocked Stripe)
- Webhook handler signature verification + idempotency
- `africa-eligibility` JWT verification

### 9.2 Integration tests

- Stripe webhook signature smoke test
- Embedded checkout iframe loads through COOP/COEP-relaxed `/pricing` route
- Signup with `?code=` end-to-end (creates user, org membership, Stripe sub)
- Admin RBAC layered defense (middleware + layout + route handler all reject
  non-admins independently)

### 9.3 Manual QA

- Pro Africa cohort seat-cap enforcement (try to sign up past `max_seats`)
- Pro Africa 24-month commitment lock (try to cancel from Customer Portal
  before commitment end)
- Business hourly overage (run a 65-min meeting, verify 1 meter event)
- Enterprise concurrent big-room (simulate 1001-participant join, verify
  1 meter event per session)
- Recording disclosure copy appears on `/pricing`, on the in-app recording
  start dialog, and on the recording detail page
- Admin panel — all 6 sections render without preflight breakage
- Active rooms monitor — start a meeting, see it appear in admin within 5s
- Email visibility — admin sees email for own-org users, not cross-org guests

## 10. Acceptance criteria

This spec is "done" when:

- All five SKUs are purchasable via embedded Stripe Checkout (Pro Africa
  via cohort signup URL).
- Webhook handler correctly mirrors all 5 critical events into
  `subscriptions`; signature verification rejects tampered payloads.
- Pro Africa 4-layer commitment lock prevents cancellation in months 1-23.
- Business hourly overage fires correct meter events for 65-min, 125-min,
  185-min meetings.
- Enterprise concurrent big-room fires exactly once per session that
  crosses 1000 attendees.
- Admin panel renders all 6 sections, RBAC blocks non-admins at all 3 layers.
- Org admin can create an org, share its signup URL, see members appear,
  view their plan + Stripe state.
- Recording disclosure copy appears anywhere recording is mentioned.
- Deepgram surface is entirely removed; transcription falls back from
  Whisper to Web Speech with a user notification; no cloud path remains.
- E2EE-encryption-type badge appears per track in admin participant view.
- Hero copy reads "We cannot see what's said in your meetings." (not
  "We cannot see your meetings.").

## 11. Open items requiring user action (sidelined)

(Maintained in TaskCreate #12 — bring up when user returns.)

1. License JWT for `@dvai-bridge/*` v4 production smoke test.
2. iOS 15.4 WKWebView `RTCRtpScriptTransform` parity test (needs Mac + Xcode).
3. Production Appwrite collection creation (`subscriptions`, `stripe_events`,
   `organizations`, `active_rooms`, `session_logs`, `org_branding`) — I
   will write a migration script; user runs it against prod.
4. Stripe Dashboard pre-config: products, prices for all 5 SKUs (+
   business_extra_hours, concurrent_big_room_session meters), webhook
   endpoint registration, Africa cohort Portal configuration with
   `subscription_cancel` disabled, Stripe Tax setup, Adaptive Pricing
   enabled. **The Africa Portal configuration ID becomes
   `STRIPE_PORTAL_CONFIG_AFRICA` env var.**
5. Per-customer Enterprise LiveKit node provisioning runbook (manual ops
   for v1, automation for v2).
6. Apple Intelligence backend exact runtime config in `@dvai-bridge/*` v4
   (smoke test once Phase 1 Capacitor starts).
7. Pro Mainstream value-prop revisit post-launch.
8. iOS Broadcast Extension for screen share (Phase 2 RN scope).
