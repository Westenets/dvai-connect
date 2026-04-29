# Payments + Subscriptions — Strawman Spec (Problem #5)

**Status:** Strawman draft, NOT for implementation. Discussion document
for the morning. Every section below is a proposal to argue with, not a
decision to execute.

**Why a strawman, not a full design:** Pricing tier specifics, free-tier
limits, trial periods, currency handling, refund policy, and roughly a
dozen other product decisions need your input before architecture
locks in. Writing a full spec on guesses would be wasted work. This
document captures the *technical scaffolding* and *proposed defaults*
so we can converge fast.

**Dependencies:** Implements `isPaidUser()` (currently a stub returning
false in `lib/auth/subscription.ts`). When this lands, the transcription
spec's Tier 1 (Cloud STT) and the recording-detail "Improve transcript
quality" button automatically come alive for paid users.

---

## 1. Proposed pricing tiers (strawman — argue with these)

| Tier | Price | Local AI | Cloud STT (live CC) | Cloud re-transcription | Recording storage | Meeting length | Participants |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | ✅ unlimited | ❌ (Tier 2/3 fallback) | ❌ | 5 GB total | 60 min | up to 8 |
| **Pro** | $12/mo or $120/yr | ✅ unlimited | ✅ included | ✅ included | 50 GB | unlimited | up to 25 |
| **Team** | $20/seat/mo (3 seat min) | ✅ unlimited | ✅ included | ✅ included | 200 GB shared | unlimited | up to 100 |
| **Enterprise** | Contact sales | ✅ + on-prem option | ✅ | ✅ | custom | unlimited | unlimited |

Open product questions for you:

1. **Free tier meeting length**: 60 min is mid-pack (Zoom Free is 40,
   Google Meet Free is 60). Bump to 90? Drop to 40? Eliminate?
2. **Free tier cloud STT**: I default to "none" — keep it as a paid
   differentiator. Alternative: 30 min/month free quota to let users
   "try" cloud quality and convert.
3. **Pro pricing**: $12/mo is in the consumer SaaS sweet spot (Notion
   Plus, Loom Pro, etc.). Could go $9 to undercut, $15 to anchor as
   premium.
4. **Annual discount**: 16% off (i.e. ~$10/mo equivalent) — standard.
5. **Team pricing**: per-seat with 3-seat minimum is conservative.
   Slack-style. Could do flat $50/mo for "small team" up to 10 seats.
6. **Trial**: 14-day Pro trial on signup, no card required, soft-cap
   to free tier on expiry? Or paid-only (more conversion, less viral).
7. **Currency**: USD as primary. EUR + INR + GBP as automatic per-IP
   localization? Or USD-only at launch, expand later.

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

## 6. Things explicitly NOT in this strawman

- AP2 / Agentic payments — deferred per earlier brainstorm
- In-app purchases (App Store / Play Store) — not relevant for web app
- Crypto / wallet payments — out of scope for v1
- Usage-based billing — fixed-tier first; consider for enterprise
- Affiliate / referral program — separate feature
- Refund policy — needs you to write the actual policy text

## 7. Open questions for the morning

These are blocking before I can write a real spec:

1. **Free tier limits** (meeting length, storage, participants) — pick
   numbers
2. **Pro pricing** — $9/$12/$15
3. **Annual discount %** — 16% (standard) or other
4. **Team plan minimum seats** — 3? 5? flat for small teams?
5. **Trial: yes/no, no-card vs card-required**
6. **Currency strategy** — USD-only at launch, or multi-currency from
   day one
7. **Soft-cap behavior on free tier** — block at limit, or allow with
   degraded UX (e.g. "this meeting will end in 5 min, upgrade for
   unlimited")
8. **Team seat reassignment cooldown** — if you remove a seat, is it
   immediately freed for reassignment, or is there a 30-day delay
   (Stripe quirk for proration)?

Once these are answered, I'll write the real Slice A + B spec and
implement them.
