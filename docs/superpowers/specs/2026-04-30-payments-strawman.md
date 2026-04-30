# Payments + Subscriptions — Spec (Problem #5)

**Status:** Decisions locked. Ready for implementation planning.
Pricing reasoning + cost-per-user analysis lives in the companion
document `dvai-meet-cost-and-pricing-analysis.docx` (delivered to the
team for review).

**Dependencies:** Implements `isPaidUser()` (currently a stub returning
false in `lib/auth/subscription.ts`). When this lands, the transcription
spec's Tier 1 (Cloud STT) and the recording-detail "Improve transcript
quality" button automatically come alive for paid users.

---

## 1. Pricing tiers — LOCKED

| Tier | Monthly | Annual (16% off) | Min seats | Sales motion |
|---|---|---|---|---|
| **Free** | $0 | — | 1 | Self-serve |
| **Pro** | $12/user/mo | $120/user/yr ($10/mo equiv) | 1 | Self-serve |
| **Team** | $20/seat/mo | $200/seat/yr ($16.67/mo equiv) | 3 | Self-serve |
| **Business** | $40/seat/mo | $400/seat/yr | 10 | Sales-assisted |
| **Enterprise** | Custom (start at $50K/year) | annual only | typically 25+ | Sales-led |

### Per-tier feature gates and limits

**Free** (loss leader; conversion engine):
- 60-min meeting length cap, 5-min warning before cap
- Up to 8 participants per meeting
- 5 GB recording storage
- 30 min/month cloud STT trial (then falls back to local AI/Web Speech)
- E2EE included (key differentiator vs Zoom/Meet/Teams free tiers)
- All local AI features (Gemma summary, RAG, embeddings)
- Web Speech captions (browser-native, free)

**Pro**:
- Unlimited meeting length
- Up to 25 participants per meeting
- 100 GB recording storage
- 100 hrs/month cloud STT included; overage at $0.30/min
- All AI features (local + cloud)
- Re-transcription on past recordings
- E2EE included
- Single user (no team workspace)

**Team** (3-seat minimum = $60/mo floor):
- Pro features per seat
- Org workspace + basic admin
- 200 GB shared storage pool
- 500 hrs/month STT pool (shared org-wide)
- Up to 100 participants per meeting

**Business** (10-seat minimum = $400/mo floor):
- Team features per seat
- SSO/SAML, audit logs, advanced admin
- 1 TB shared storage
- Unlimited STT (200 hrs/seat/month soft-cap before sales review)
- Up to 300 participants per meeting
- White-label add-on: +$10/seat/month
- Priority support
- Sales-assisted onboarding (one human call)

**Enterprise** (annual contracts only, $50K floor):
- Dedicated infrastructure (own LiveKit node, partitioned data security)
- HIPAA BAA, SOC2 Type II reports
- White-label included
- 24/7 dedicated CSM with SLA + service credits
- Custom integrations, custom SSO providers
- Up to 1,000 participants per meeting
- API access for white-label resellers

---

## 1.1 Decisions captured (was open questions)

- **Free meeting length**: 60 min, with soft-cap behavior — at 55 min show "5 min remaining → upgrade for unlimited" upsell prompt; if user dismisses or doesn't upgrade, hard-stop at 60 min.
- **Free cloud STT**: 30 min/month quota (per-user), to let users sample cloud quality and convert.
- **Annual discount**: 16% off across all tiers (i.e., 2 months free on annual).
- **Trial**: Implementation ready but feature-flagged via `STRIPE_TRIAL_ENABLED` env var, **default off**. When enabled: 14-day Pro trial on signup, no card required, soft-cap to Free on expiry.
- **Currency**: USD primary at launch. EUR + INR + GBP automatic per-IP localization to follow once Stripe Tax is configured.
- **Team seat reassignment**: Immediately freed for reassignment. If the seat was paid for the current term, it can be reassigned to a different user without additional charge until the term ends.
- **Soft-cap on free tier meetings**: Allow with degraded UX (countdown + upsell modal). If the user dismisses the upsell, hard-block at the limit.
- **Pricing**: see table above. Pro $12, Team $20, Business $40, Enterprise custom $50K+/year. Reasoning lives in the companion DOCX cost analysis.

---

## 2. Architecture

```
                    ┌─────────────────────────────┐
                    │  Stripe                     │
                    │  (Products, Prices,         │
                    │   Subscriptions, Customers) │
                    └──────────┬──────────────────┘
                               │ webhooks
                               ▼
                    ┌─────────────────────────────┐
                    │  app/api/stripe/webhook     │
                    │  (Next.js route handler)    │
                    └──────────┬──────────────────┘
                               │ Appwrite Functions
                               ▼
                    ┌─────────────────────────────┐
                    │  Appwrite                   │
                    │  - users.prefs.subscription │
                    │  - subscriptions table      │
                    └──────────┬──────────────────┘
                               │ read on session refresh
                               ▼
                    ┌─────────────────────────────┐
                    │  Client                     │
                    │  - useSubscription() hook   │
                    │  - isPaidUser() implementation│
                    └─────────────────────────────┘
```

Why this shape:

- **Stripe is the source of truth** for billing state. Never persist
  prices/products in our DB; always reference Stripe price IDs.
- **Webhooks are the only way subscription state changes propagate**
  to our DB. Direct client-side mutation is forbidden — opens fraud
  vectors.
- **Appwrite stores a denormalized subscription snapshot** so we don't
  hit Stripe on every page render. Snapshot is `{ tier, status,
  currentPeriodEnd, cancelAtPeriodEnd, stripeCustomerId,
  stripeSubscriptionId }`.
- **`isPaidUser()` becomes** `useAuth().user?.prefs?.subscription?.tier !== 'free'`
  with a current-period-end check.

## 3. Stripe setup checklist (for you to do manually)

These you create in the Stripe dashboard, not in code:

- [ ] **Products** — one per tier (Free, Pro, Team, Enterprise). Free
      and Enterprise are "metadata-only" products with no price.
- [ ] **Prices** — for Pro (monthly + annual), Team (monthly per seat
      + annual per seat). Mark all in USD; add other currencies later.
- [ ] **Customer portal** — enable in Settings → Billing → Customer
      portal so users can self-serve cancel/upgrade/payment-method
      changes.
- [ ] **Tax** — enable Stripe Tax (handles US sales tax + EU VAT
      automatically).
- [ ] **Webhook endpoint** — `https://meet.deepvoiceai.co/api/stripe/webhook`
      subscribed to: `customer.subscription.created`,
      `customer.subscription.updated`, `customer.subscription.deleted`,
      `invoice.payment_succeeded`, `invoice.payment_failed`.
- [ ] **Restricted API key** — for server-side use only. Never expose
      the `sk_live_...` key to the client.

## 4. Data model

### `users.prefs.subscription` (Appwrite — single-user denormalized)

```ts
interface SubscriptionSnapshot {
    tier: 'free' | 'pro' | 'team' | 'enterprise';
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: number | null;  // unix ms
    cancelAtPeriodEnd: boolean;
    seats?: number;  // for team tier
    teamId?: string;  // for team tier members (link to team owner)
}
```

### `subscriptions` collection (Appwrite — full history for audit)

```ts
interface SubscriptionEvent {
    $id: string;
    userId: string;
    stripeEventId: string;  // for idempotency
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: number;
}
```

Webhook handler upserts both: snapshot on `users.prefs`, event log
to `subscriptions` collection.

## 5. Implementation slices (rough — for the eventual full spec)

### Slice A — Read-only foundation (1-2 days)

- Real `isPaidUser()` reading from `users.prefs.subscription`
- `useSubscription()` React hook returning the snapshot
- Tier 1 (Cloud STT) and "Improve transcript" button start respecting
  paid status (no UI changes — they were already gated, just
  unblocking when the gate flips)

### Slice B — Stripe Checkout flow (2-3 days)

- `app/api/stripe/checkout/route.ts` — creates a Checkout Session
  for upgrading. Server-side; never trust client price IDs.
- Settings page → "Plan" section showing current tier + "Upgrade" button
- Pricing page (marketing) with the tier table; "Upgrade" → Checkout
- Stripe Checkout success/cancel routes that show clean UX

### Slice C — Webhook + state sync (2 days)

- `app/api/stripe/webhook/route.ts` — verifies signature, upserts
  Appwrite snapshot, emits to subscriptions collection
- Idempotency via `stripeEventId` unique key
- Local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### Slice D — Customer portal & lifecycle (1-2 days)

- Settings → "Manage billing" button → server-side creates portal
  session URL → redirect
- Handle cancel-at-period-end UI: show "Cancels on <date>" warning
  banner
- Handle past_due / unpaid: blocking modal asking to update payment

### Slice E — Team plan specifics (2-3 days)

- Team owner can invite members (email-based)
- Seat usage tracking; auto-increase via Stripe `subscription_update`
  on invite acceptance
- Member roles: owner / admin / member

### Slice F — Soft enforcement of free-tier limits (1-2 days)

- Meeting length cap (60 min for Free): show countdown at 5 min
  remaining, end meeting at zero with upgrade modal
- Storage quota for recordings: at 90% show warning, at 100% block
  new recordings (existing playable; oldest can be deleted)

### Slice G — Trials and discounts (1 day)

- 14-day Pro trial on signup — Stripe handles via `trial_period_days`
- Promo codes (Stripe-native)

**Total estimate**: 12–16 days of focused work for a solid v1.
Slice A unblocks all the dvai-meet AI features that depend on paid
status — start there.

## 6. Things explicitly NOT in this spec

- AP2 / Agentic payments — deferred indefinitely per earlier brainstorm
- In-app purchases (App Store / Play Store) — not relevant for web app
- Crypto / wallet payments — out of scope for v1
- Usage-based billing per minute (other than STT overage) — fixed-tier
  first; revisit for enterprise custom contracts
- Affiliate / referral program — separate feature, deferred
- Refund policy — needs separate legal-reviewed policy text

## 7. STT cost handling (per the cost analysis)

Cloud STT is the highest-variability operating cost. To prevent
runaway:

- **Free tier**: Hard cap 30 min/month per user. Counter resets on the
  1st of each calendar month. When exceeded, cloud STT requests return
  402 with an upsell payload; the client falls back to local AI/Web
  Speech transparently.
- **Pro**: 100 hrs/month included. Overage billed at $0.30/min via
  Stripe metered billing. Email warning at 80% and 100%.
- **Team**: 50 hrs/seat/month included, pooled at the org level (so a
  3-seat Team has a 150-hr pool any seat can draw from). Overage
  $0.30/min.
- **Business**: Unlimited up to 200 hrs/seat/month soft cap. Beyond
  the soft cap triggers a sales-team review for fair-use enforcement;
  no automatic overage billing.
- **Enterprise**: Truly unlimited. Custom contract specifies usage
  expectations.

These caps assume Deepgram Nova-3 at $0.26/streaming-hour as the
upstream provider. If we switch providers (or self-host Whisper on
our own GPU), revisit the limits to keep gross margins ≥50%.

## 8. Acquisition narrative this pricing supports

Designed so that at scale we hit the metrics acquirers care about:

- **ARR per customer** is meaningful: $144 (Pro), $720+ (Team avg),
  $4,800+ (Business avg), $50K+ (Enterprise)
- **Net Revenue Retention** levers are built in: seat expansion in
  Team/Business, white-label add-on, STT overage billing
- **Defensibility** = E2EE + on-device AI MOAT, codified in the price
  premium (Pro is 25% above Zoom Pro and customers pay it for the
  privacy promise)
- **Compliance-ready**: SOC2/HIPAA targeted at the Business and
  Enterprise tiers where they're sales-blocking
- **Path to $5–10M ARR** = ~3,000–6,000 paid customers (mixed) or
  ~100–200 enterprise contracts. At 5–10× ARR multiples, that's the
  $25–100M acquisition zone we want to be in.
