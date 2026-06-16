# Pricing + Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Ship the locked Tab 2 pricing, subscription backend, signup-with-code
flow, and admin panel end-to-end across 6 sequential PRs.

**Architecture:** Appwrite Teams as org primitive. Stripe Embedded Checkout

- Customer Portal + webhooks → `subscriptions` + `stripe_events` collections.
  Generic `organizations` collection powers cohort signup-with-code (Africa
  cohort is the first instance, extensible). Admin panel at `/admin/*` with
  RBAC layered defense. Hero copy: "We cannot see what's said in your
  meetings." Recording disclosure: "Cloud recording uses server-side encryption
  (not end-to-end)..." Deepgram is REMOVED — fall back to Web Speech only.

**Tech stack:** Next.js 16 (Turbopack), Appwrite (Teams + Databases + Realtime),
Stripe (Embedded Checkout + Customer Portal + Billing Meters + Schedules

- Tax + Adaptive Pricing), TanStack Table v8, Tremor blocks (vendored,
  preflight-safe), Recharts, react-hot-toast, vitest + happy-dom.

**Spec source of truth:**
`docs/superpowers/specs/2026-06-13-pricing-admin-design.md`

## Pre-flight

Before starting any PR:

- Branch off `dvai-bridge-v2-migration` (or rename it; this plan assumes the
  current feature branch).
- `pnpm install` must succeed (handled by Task 2 — bridge migration).
- All Task 2 commits (bridge v4 + Deepgram removal) must be in the branch.
- License JWT for `@dvai-bridge/*` v4 production must be confirmed working
  (sidelined — see TaskCreate #12).

## File structure (locked in this plan)

See spec §7. The 6 PRs split file changes as follows:

- **PR 3a-1**: `lib/auth/admin.ts`, `lib/auth/role.ts`, `lib/auth/org.ts`,
  `lib/pricing/tiers.ts`, `app/api/connection-details/route.ts`,
  `app/api/record/*`, `app/api/agent/route.ts`, `components/AuthProvider.tsx`.
- **PR 3b**: Appwrite collections (via migration script),
  `app/api/webhooks/stripe/route.ts`, `app/api/cron/*`,
  `app/api/livekit/webhook/route.ts`, `lib/actions/stripe.ts`,
  `next.config.js` (COOP/COEP), env vars.
- **PR 3a-2**: `lib/auth/subscription.ts`, all 8 callers update.
- **PR 3c**: `app/pricing/page.tsx`, `app/pricing/africa/page.tsx`,
  `app/signup/page.tsx`,
  `app/api/pricing/africa-eligibility/route.ts`,
  `lib/components/CheckoutDrawer.tsx`, FAQ component.
- **PR 3d**: `middleware.ts` (admin route protection),
  `app/admin/layout.tsx`, `app/admin/page.tsx`,
  `lib/components/admin/DataTable.tsx`,
  `lib/components/admin/KpiCard.tsx`,
  CI lint regex in `scripts/lint-tailwind.mjs`.
- **PR 3e**: `app/admin/pricing/*`, `app/admin/organizations/*`,
  `app/admin/recordings/*`, `app/admin/rooms/*`,
  `app/admin/branding/*`, plus matching
  `app/api/admin/**/route.ts` handlers.

---

## PR 3a-1: Foundation (auth + org primitive + missing gates)

**Goal:** Adopt Appwrite Teams as the org primitive; add session-cookie auth
to the 3 unauthenticated API routes; add the agent concurrency gate; snapshot
plan tier into room_admins; gate participant joins by tier cap.

### Task 1: Single-source-of-truth pricing tiers

**Files:**

- Create: `lib/pricing/tiers.ts`

- [ ] Create the tier definitions matching Tab 2:

```ts
// lib/pricing/tiers.ts
/**
 * Single source of truth for tier definitions. Read by the public /pricing
 * route, the admin Pricing CRUD, the agent-quota gate, the participant-cap
 * gate, and the meeting-length gate.
 *
 * Base price values are in Stripe (single source of truth for billing).
 * Display fields (name, badges, description, feature checkmarks) are
 * editable from the admin panel and persisted in Appwrite collection
 * `pricing_tiers` — at runtime we merge the static defaults below with
 * the admin-edited overrides.
 */

export type TierId = 'free' | 'pro_africa' | 'pro' | 'business' | 'enterprise';

export interface TierDefinition {
    id: TierId;
    displayName: string;
    badge?: string;
    basePriceUsd: number; // 0 / 14.99 / 18.99 / 48.99 / 449.99
    /** Stripe Price ID — overridden by admin Pricing CRUD when prices rotate. */
    stripePriceId: string | null;
    meetingMaxMinutes: number; // 40 | 60 | 60 | 60 | 180
    attendeeCap: number; // 10 | 100 | 100 | 300 | 1000
    cloudRecording: boolean;
    meetingAgentQuota: number; // 0 | 1 | 1 | 1 | 1
    notetaking: boolean;
    screenShare: boolean;
    customBranding: boolean;
    adminDashboard: boolean;
    dedicatedNode: boolean;
    support: 'community' | '24-7';
    e2ee: true; // every tier
    sales: 'self-serve' | 'sales-assisted' | 'sales-led';
    cohortRestricted: boolean;
}

export const TIERS: Record<TierId, TierDefinition> = {
    free: {
        id: 'free',
        displayName: 'Free',
        basePriceUsd: 0,
        stripePriceId: null,
        meetingMaxMinutes: 40,
        attendeeCap: 10,
        cloudRecording: false,
        meetingAgentQuota: 0,
        notetaking: false,
        screenShare: true,
        customBranding: false,
        adminDashboard: false,
        dedicatedNode: false,
        support: 'community',
        e2ee: true,
        sales: 'self-serve',
        cohortRestricted: false,
    },
    pro_africa: {
        id: 'pro_africa',
        displayName: 'Pro (Africa Cohort)',
        basePriceUsd: 14.99,
        stripePriceId: null,
        meetingMaxMinutes: 60,
        attendeeCap: 100,
        cloudRecording: true,
        meetingAgentQuota: 1,
        notetaking: true,
        screenShare: true,
        customBranding: false,
        adminDashboard: false,
        dedicatedNode: false,
        support: 'community',
        e2ee: true,
        sales: 'self-serve',
        cohortRestricted: true,
    },
    pro: {
        id: 'pro',
        displayName: 'Pro',
        basePriceUsd: 18.99,
        stripePriceId: null,
        meetingMaxMinutes: 60,
        attendeeCap: 100,
        cloudRecording: true,
        meetingAgentQuota: 1,
        notetaking: true,
        screenShare: true,
        customBranding: false,
        adminDashboard: false,
        dedicatedNode: false,
        support: 'community',
        e2ee: true,
        sales: 'self-serve',
        cohortRestricted: false,
    },
    business: {
        id: 'business',
        displayName: 'Business',
        basePriceUsd: 48.99,
        stripePriceId: null,
        meetingMaxMinutes: 60,
        attendeeCap: 300,
        cloudRecording: true,
        meetingAgentQuota: 1,
        notetaking: true,
        screenShare: true,
        customBranding: true,
        adminDashboard: true,
        dedicatedNode: false,
        support: 'community',
        e2ee: true,
        sales: 'sales-assisted',
        cohortRestricted: false,
    },
    enterprise: {
        id: 'enterprise',
        displayName: 'Enterprise',
        basePriceUsd: 449.99,
        stripePriceId: null,
        meetingMaxMinutes: 180,
        attendeeCap: 1000,
        cloudRecording: true,
        meetingAgentQuota: 1,
        notetaking: true,
        screenShare: true,
        customBranding: true,
        adminDashboard: true,
        dedicatedNode: true,
        support: '24-7',
        e2ee: true,
        sales: 'sales-led',
        cohortRestricted: false,
    },
};

export const VISIBLE_PUBLIC_TIER_IDS: TierId[] = ['free', 'pro', 'business', 'enterprise'];
```

- [ ] Commit

```bash
git add lib/pricing/tiers.ts
git commit -m "pricing: add single-source-of-truth tier definitions (Tab 2 locked)"
```

### Task 2: Auth role + admin + org helpers

**Files:**

- Create: `lib/auth/admin.ts`, `lib/auth/role.ts`, `lib/auth/org.ts`
- Test: `lib/auth/__tests__/admin.test.ts`, `role.test.ts`, `org.test.ts`

- [ ] Write failing tests for role resolution from Appwrite Team memberships

- [ ] Implement `lib/auth/role.ts`:

```ts
// lib/auth/role.ts
import type { Models } from 'appwrite';
import { teams } from '@/lib/appwrite';

export type AppRole = 'member' | 'admin' | 'owner';

/** Reads the user's role across all Teams they belong to. */
export async function getUserRoles(userId: string): Promise<Map<string, AppRole>> {
    const memberships = await teams.listMemberships(/* teamId? — use listAll instead */);
    const roles = new Map<string, AppRole>();
    for (const m of memberships.memberships) {
        const role = m.roles.includes('owner')
            ? 'owner'
            : m.roles.includes('admin')
              ? 'admin'
              : 'member';
        roles.set(m.teamId, role);
    }
    return roles;
}

export async function getRoleInTeam(userId: string, teamId: string): Promise<AppRole | null> {
    const all = await getUserRoles(userId);
    return all.get(teamId) ?? null;
}
```

- [ ] Implement `lib/auth/admin.ts`:

```ts
// lib/auth/admin.ts
import { getCurrentUser } from '@/lib/auth/session';
import { getUserRoles } from './role';
import { redirect } from 'next/navigation';

export async function isOrgAdmin(userId: string, teamId: string): Promise<boolean> {
    const roles = await getUserRoles(userId);
    const r = roles.get(teamId);
    return r === 'admin' || r === 'owner';
}

/** Server-component guard. Redirects non-admins to /. */
export async function requireAdmin(): Promise<{ userId: string; teamIds: string[] }> {
    const user = await getCurrentUser();
    if (!user) redirect('/login');
    const roles = await getUserRoles(user.$id);
    const adminTeamIds = [...roles.entries()]
        .filter(([, r]) => r === 'admin' || r === 'owner')
        .map(([t]) => t);
    if (adminTeamIds.length === 0) redirect('/');
    return { userId: user.$id, teamIds: adminTeamIds };
}
```

- [ ] Implement `lib/auth/org.ts`:

```ts
// lib/auth/org.ts
import { teams, databases } from '@/lib/appwrite';
import { Query, ID } from 'appwrite';

export interface Org {
    $id: string;
    appwriteTeamId: string;
    name: string;
    country: string;
    program_name: string;
    signup_code: string;
    tier_override: string | null;
    commitment_months: number | null;
    max_seats: number;
    signup_count: number;
    expires_at: string | null;
    is_active: boolean;
    primary_contact_name: string;
    primary_contact_email: string;
    billing_contact_email: string;
    notes: string;
    createdBy: string;
    createdAt: string;
}

const DB = process.env.NEXT_PUBLIC_APPWRITE_DB!;
const COLL = 'organizations';

export async function getOrgByCode(code: string): Promise<Org | null> {
    const res = await databases.listDocuments<Org>(DB, COLL, [
        Query.equal('signup_code', code),
        Query.equal('is_active', true),
        Query.limit(1),
    ]);
    return res.documents[0] ?? null;
}

export async function getOrgByTeamId(teamId: string): Promise<Org | null> {
    const res = await databases.listDocuments<Org>(DB, COLL, [
        Query.equal('appwriteTeamId', teamId),
        Query.limit(1),
    ]);
    return res.documents[0] ?? null;
}

export async function getCurrentOrg(userId: string): Promise<Org | null> {
    // Find the team where user is owner or admin (or first member team)
    const memberships = await teams.list();
    if (memberships.teams.length === 0) return null;
    // Prefer team where user is owner; fall back to first.
    // (org membership is single-org for v1; multi-org defer to v2)
    return getOrgByTeamId(memberships.teams[0].$id);
}

/** Atomic seat-cap check + increment. Race-protected via $updatedAt conditional. */
export async function reserveSignupSeat(org: Org): Promise<boolean> {
    if (org.max_seats > 0 && org.signup_count >= org.max_seats) return false;
    if (org.expires_at && new Date(org.expires_at) < new Date()) return false;
    if (!org.is_active) return false;
    try {
        await databases.updateDocument(DB, COLL, org.$id, {
            signup_count: org.signup_count + 1,
        });
        return true;
    } catch (err: any) {
        // Conflict — another concurrent signup beat us. Caller should retry by re-reading.
        return false;
    }
}

export function generateSignupCode(programName: string): string {
    const random = crypto
        .getRandomValues(new Uint8Array(6))
        .reduce((s, b) => s + b.toString(36).padStart(2, '0').toUpperCase(), '');
    return `${programName.toUpperCase()}-${random}`;
}
```

- [ ] Run tests; verify pass; commit

### Task 3: Session-cookie auth + paid-feature gates

**Files:**

- Create: `lib/auth/session.ts` (if missing)
- Modify: `app/api/record/start/route.ts`, `app/api/record/stop/route.ts`,
  `app/api/agent/route.ts`, `app/api/connection-details/route.ts`

- [ ] Implement `lib/auth/session.ts` — uniform server-side session check via
      Appwrite session cookie:

```ts
// lib/auth/session.ts
import { cookies } from 'next/headers';
import { Client, Account } from 'node-appwrite';

export async function getCurrentUser() {
    const cookieStore = await cookies();
    const session = cookieStore.get('a_session_' + process.env.APPWRITE_PROJECT_ID);
    if (!session) return null;
    const client = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.APPWRITE_PROJECT_ID!)
        .setSession(session.value);
    try {
        const account = new Account(client);
        return await account.get();
    } catch {
        return null;
    }
}
```

- [ ] Add auth gate to `app/api/record/start/route.ts`:

```ts
// At the top of the GET handler, before any work:
const user = await getCurrentUser();
if (!user) return new Response('Unauthorized', { status: 401 });
// Then check tier allows recording:
const plan = await getUserPlan(user.$id);
if (!TIERS[plan].cloudRecording) {
    return Response.json({ error: 'Recording requires Pro or higher.' }, { status: 402 });
}
```

- [ ] Same auth gate on `app/api/record/stop/route.ts`.

- [ ] Add auth gate + agent-quota check to `app/api/agent/route.ts`:

```ts
const user = await getCurrentUser();
if (!user) return new Response('Unauthorized', { status: 401 });
const plan = await getUserPlan(user.$id);
if (TIERS[plan].meetingAgentQuota === 0) {
    return Response.json({ error: 'Meeting agent requires Pro or higher.' }, { status: 402 });
}
// Concurrency: count AGENT participants in the room
const roomService = new RoomServiceClient(/* ... */);
const participants = await roomService.listParticipants(roomName);
const agentCount = participants.filter((p) => p.kind === ParticipantInfo_Kind.AGENT).length;
if (agentCount >= TIERS[plan].meetingAgentQuota) {
    return Response.json({ error: 'Meeting agent quota reached for this room.' }, { status: 409 });
}
```

- [ ] Modify `app/api/connection-details/route.ts`:
    - On `isCreator=true`: snapshot the creator's plan tier into `room_admins`
      doc (new field `creator_plan`).
    - On `isCreator=false`: read the creator's plan from `room_admins`, count
      current participants via `roomService.listParticipants`, reject 403 if
      over `TIERS[plan].attendeeCap`.
    - Always: insert into `session_logs` collection with
      `{ identity, orgId, ip: x-forwarded-for, userAgent, joinedAt, roomSid }`.

- [ ] Run tests; verify pass; commit

### Task 4: PR 3a-1 final verification

- [ ] `pnpm vitest run lib/auth lib/pricing` — all green
- [ ] `pnpm build` — passes
- [ ] Manual: try to call `/api/agent` without auth → 401; with Free tier
      auth → 402; with Pro auth but already 1 agent in room → 409; with Pro
      auth and no agent → 200.
- [ ] Commit + push as `feat(pricing-3a-1): foundation — auth + org primitive + paid-feature gates`

---

## PR 3b: Stripe + webhooks + collections

**Goal:** Wire all 6 new Appwrite collections, Stripe Checkout (embedded) +
Customer Portal + webhook handler + 5 critical events + Pro Africa 4-layer
commitment lock + Business hourly meter + Enterprise big-room meter +
Stripe Tax + COOP/COEP relaxation for `/pricing` route.

### Task 1: Appwrite collection migration script

**Files:**

- Create: `scripts/appwrite-migrate-2026-06-13.mjs`

- [ ] Write the migration script — creates 6 collections with indexes:
      `subscriptions`, `stripe_events`, `organizations`, `active_rooms`,
      `session_logs`, `org_branding`.

```js
// scripts/appwrite-migrate-2026-06-13.mjs
// Usage: APPWRITE_API_KEY=... node scripts/appwrite-migrate-2026-06-13.mjs
// Idempotent — re-running is safe.
import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.NEXT_PUBLIC_APPWRITE_DB;

async function ensureCollection(id, name, attrs, indexes) {
    try {
        await db.createCollection(DB, id, name);
    } catch (e) {
        if (!String(e?.message).includes('already exists')) throw e;
    }
    for (const a of attrs) {
        try {
            await applyAttr(id, a);
        } catch (e) {
            if (!String(e?.message).includes('already exists')) throw e;
        }
    }
    for (const i of indexes) {
        try {
            await db.createIndex(DB, id, i.key, i.type, i.attributes, i.orders);
        } catch (e) {
            if (!String(e?.message).includes('already exists')) throw e;
        }
    }
}

function applyAttr(collId, a) {
    const { name, type, required = false, size, ...rest } = a;
    if (type === 'string') return db.createStringAttribute(DB, collId, name, size ?? 256, required);
    if (type === 'integer') return db.createIntegerAttribute(DB, collId, name, required);
    if (type === 'boolean') return db.createBooleanAttribute(DB, collId, name, required);
    if (type === 'datetime') return db.createDatetimeAttribute(DB, collId, name, required);
    if (type === 'enum') return db.createEnumAttribute(DB, collId, name, rest.elements, required);
}

// subscriptions
await ensureCollection(
    'subscriptions',
    'subscriptions',
    [
        { name: 'userId', type: 'string', required: true, size: 64 },
        { name: 'orgId', type: 'string', required: false, size: 64 },
        { name: 'stripeCustomerId', type: 'string', required: true, size: 128 },
        { name: 'stripeSubscriptionId', type: 'string', required: true, size: 128 },
        { name: 'stripeScheduleId', type: 'string', size: 128 },
        {
            name: 'tier',
            type: 'enum',
            elements: ['free', 'pro_africa', 'pro', 'business', 'enterprise'],
            required: true,
        },
        {
            name: 'status',
            type: 'enum',
            elements: ['active', 'past_due', 'canceled', 'trialing', 'incomplete', 'unpaid'],
            required: true,
        },
        { name: 'currentPeriodStart', type: 'datetime', required: true },
        { name: 'currentPeriodEnd', type: 'datetime', required: true },
        { name: 'cancelAtPeriodEnd', type: 'boolean', required: true },
        { name: 'isAfricaCohort', type: 'boolean', required: true },
        { name: 'africaCohortCode', type: 'string', size: 64 },
        { name: 'africaCommitmentEnd', type: 'datetime' },
        { name: 'priceId', type: 'string', required: true, size: 128 },
    ],
    [
        { key: 'idx_userId', type: 'key', attributes: ['userId'] },
        { key: 'idx_orgId', type: 'key', attributes: ['orgId'] },
        { key: 'idx_stripeCustomerId', type: 'unique', attributes: ['stripeCustomerId'] },
        { key: 'idx_stripeSubscriptionId', type: 'unique', attributes: ['stripeSubscriptionId'] },
    ],
);

// stripe_events
await ensureCollection(
    'stripe_events',
    'stripe_events',
    [
        { name: 'type', type: 'string', required: true, size: 64 },
        { name: 'payload', type: 'string', required: true, size: 1048576 },
        { name: 'processed', type: 'boolean', required: true },
        { name: 'processedAt', type: 'datetime' },
        { name: 'error', type: 'string', size: 1024 },
    ],
    [{ key: 'idx_processed', type: 'key', attributes: ['processed'] }],
);

// organizations
await ensureCollection(
    'organizations',
    'organizations',
    [
        { name: 'appwriteTeamId', type: 'string', required: true, size: 64 },
        { name: 'name', type: 'string', required: true, size: 128 },
        { name: 'country', type: 'string', required: true, size: 8 },
        { name: 'program_name', type: 'string', required: true, size: 32 },
        { name: 'signup_code', type: 'string', required: true, size: 32 },
        { name: 'tier_override', type: 'string', size: 32 },
        { name: 'commitment_months', type: 'integer' },
        { name: 'max_seats', type: 'integer', required: true },
        { name: 'signup_count', type: 'integer', required: true },
        { name: 'expires_at', type: 'datetime' },
        { name: 'is_active', type: 'boolean', required: true },
        { name: 'primary_contact_name', type: 'string', size: 128 },
        { name: 'primary_contact_email', type: 'string', size: 128 },
        { name: 'billing_contact_email', type: 'string', size: 128 },
        { name: 'notes', type: 'string', size: 2048 },
        { name: 'createdBy', type: 'string', required: true, size: 64 },
    ],
    [
        { key: 'idx_signup_code', type: 'unique', attributes: ['signup_code'] },
        { key: 'idx_appwriteTeamId', type: 'unique', attributes: ['appwriteTeamId'] },
    ],
);

// active_rooms
await ensureCollection(
    'active_rooms',
    'active_rooms',
    [
        { name: 'roomName', type: 'string', required: true, size: 256 },
        { name: 'creatorOrgId', type: 'string', size: 64 },
        { name: 'participantCount', type: 'integer', required: true },
        { name: 'isRecording', type: 'boolean', required: true },
        { name: 'region', type: 'string', size: 32 },
        { name: 'lastEventAt', type: 'datetime', required: true },
    ],
    [
        { key: 'idx_creatorOrgId', type: 'key', attributes: ['creatorOrgId'] },
        { key: 'idx_lastEventAt', type: 'key', attributes: ['lastEventAt'] },
    ],
);

// session_logs
await ensureCollection(
    'session_logs',
    'session_logs',
    [
        { name: 'identity', type: 'string', required: true, size: 64 },
        { name: 'orgId', type: 'string', size: 64 },
        { name: 'ip', type: 'string', size: 64 },
        { name: 'userAgent', type: 'string', size: 512 },
        { name: 'joinedAt', type: 'datetime', required: true },
        { name: 'leftAt', type: 'datetime' },
        { name: 'roomSid', type: 'string', required: true, size: 64 },
    ],
    [{ key: 'idx_roomSid', type: 'key', attributes: ['roomSid'] }],
);

// org_branding
await ensureCollection(
    'org_branding',
    'org_branding',
    [
        { name: 'logoUrl', type: 'string', size: 512 },
        { name: 'darkLogoUrl', type: 'string', size: 512 },
        { name: 'primaryColor', type: 'string', size: 16 },
        { name: 'accentColor', type: 'string', size: 16 },
        { name: 'customDomain', type: 'string', size: 256 },
        { name: 'loginScreenCopy', type: 'string', size: 1024 },
        { name: 'emailFromName', type: 'string', size: 128 },
        { name: 'emailFromAddress', type: 'string', size: 128 },
    ],
    [],
);

console.log('Migration complete.');
```

- [ ] Document the migration script as a sidelined user-action item (TaskCreate
      #12) — user needs to run it against production with their `APPWRITE_API_KEY`.

### Task 2-N: Stripe integration

(Full Stripe wiring follows the spec §5.2 through §5.8 — embedded checkout
session, customer portal, webhook handler with signature verification +
idempotency log, Africa 4-layer commitment, Business hourly meter,
Enterprise concurrent-big-room meter at 1000-participant threshold with
`roomSid:sessionId` idempotency key, Stripe Tax, COOP/COEP relaxation.)

Detailed task breakdown in the spec; implement in this order:

1. `lib/actions/stripe.ts` (createCheckoutSession, createPortalSession)
2. `app/api/webhooks/stripe/route.ts` (ack-fast, signature verify, idempotency)
3. `app/api/cron/process-stripe-events/route.ts` (drain + apply state)
4. `app/api/cron/audit-stripe-config/route.ts` (daily Africa portal drift check)
5. `app/api/livekit/webhook/route.ts` (active_rooms mirror + concurrent-big-room meter)
6. Africa subscription schedule creation (signup-with-code flow)
7. Business hourly meter (end-of-meeting fire from livekit webhook)

- [ ] Each substep: write tests, implement, run, commit.

### PR 3b verification

- [ ] `pnpm vitest run` — all green
- [ ] `pnpm build` — passes
- [ ] Local Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- [ ] Trigger test events: `stripe trigger checkout.session.completed` etc.
      Verify `subscriptions` collection populated correctly.
- [ ] Commit + push as `feat(pricing-3b): Stripe + webhooks + collections + meters`

---

## PR 3a-2: `isPaidUser()` async rewrite + tier-aware gates

**Goal:** Replace the stub `isPaidUser()` with a real async read from
`subscriptions` joined on userId via Team membership. Hydrate at AuthProvider
login into React context. 8 callers update.

### Task: rewrite

- [ ] Replace `lib/auth/subscription.ts`:

```ts
// lib/auth/subscription.ts
import { databases } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { TIERS, type TierId } from '@/lib/pricing/tiers';

const DB = process.env.NEXT_PUBLIC_APPWRITE_DB!;

/** Async — call from server actions / API routes only. React components
 *  read from AuthProvider context (synchronous). */
export async function getUserPlan(userId: string): Promise<TierId> {
    const subs = await databases.listDocuments(DB, 'subscriptions', [
        Query.equal('userId', userId),
        Query.equal('status', ['active', 'trialing']),
        Query.limit(1),
    ]);
    return (subs.documents[0] as any)?.tier ?? 'free';
}

export async function isPaidUser(userId: string): Promise<boolean> {
    const plan = await getUserPlan(userId);
    return plan !== 'free';
}
```

- [ ] Update `AuthProvider.tsx` — hydrate `plan` + `org` + `roles` on login,
      expose via context.
- [ ] Update all 8 caller sites to either: (a) consume context (React), or
      (b) await the async helper (server-side).
- [ ] `pnpm vitest run` + `pnpm build` — all green
- [ ] Commit + push as `feat(pricing-3a-2): isPaidUser async rewrite + tier-aware gates`

---

## PR 3c: Public `/pricing` + signup-with-code

**Goal:** Public pricing page, embedded Stripe Checkout drawer, Africa
eligibility gate, signup-with-code flow.

### Tasks

- [ ] `app/pricing/page.tsx` — server component reading `lib/pricing/tiers.ts`
    - admin overrides from `pricing_tiers` Appwrite collection
- [ ] Hero copy: _"End-to-end encryption on every plan, including Free.
      We cannot see what's said in your meetings."_
- [ ] 4-tier comparison table (Free / Pro / Business / Enterprise)
- [ ] Recording disclosure banner above Recording row (copy per spec §2.2)
- [ ] FAQ section (E2EE-vs-recording, Dedicated Node, big-room fee, hourly overage)
- [ ] CTA button → opens `<CheckoutDrawer />` with embedded Stripe Checkout
- [ ] `app/pricing/africa/page.tsx` — Africa eligibility gate page
      (requires signed JWT cohort token in `?token=` query param)
- [ ] `app/api/pricing/africa-eligibility/route.ts` — HMAC-JWT verification
- [ ] `app/signup/page.tsx` — read `?code=` into HIDDEN input, validate via
      `lib/auth/org.ts > reserveSignupSeat`, create user + team membership +
      per-member Pro Africa Stripe subscription, redirect to onboarding
- [ ] Anti-enumeration: signup-code errors return the same generic
      "This invite link is no longer valid" message
- [ ] `pnpm vitest run` + `pnpm build` — all green
- [ ] Commit + push as `feat(pricing-3c): public /pricing + signup-with-code flow`

---

## PR 3d: Admin panel scaffold

**Goal:** Layout, RBAC, shared components ready for PR 3e to fill in.

### Tasks

- [ ] `middleware.ts` (admin route protection — Layer 1)
- [ ] `app/admin/layout.tsx` (server component — calls `requireAdmin()` — Layer 2)
- [ ] `app/admin/page.tsx` (dashboard with KPI cards: MRR, paid customers,
      active rooms now, recordings stored)
- [ ] `lib/components/admin/DataTable.tsx` (TanStack Table v8 wrapper)
- [ ] `lib/components/admin/KpiCard.tsx` (vendored Tremor-style)
- [ ] `lib/components/admin/Sidebar.tsx`
- [ ] `scripts/lint-tailwind.mjs` (CI lint — regex `^@import\s+['"]tailwindcss['"];?\s*$`
      applied to all `app/**/*.css` — fails if matched)
- [ ] Empty pages for Pricing, Organizations, Recordings, Rooms, Branding
- [ ] `pnpm vitest run` + `pnpm build` — all green
- [ ] Manual RBAC test: log in as non-admin → middleware redirects;
      log in as admin team member → loads
- [ ] Commit + push as `feat(pricing-3d): admin panel scaffold`

---

## PR 3e: Admin features

**Goal:** Fill all 6 admin sections with real CRUD + monitoring.

### Tasks

- [ ] `app/admin/pricing/page.tsx` — Pricing CRUD (display fields editable,
      Stripe price ID mapping with confirm dialog), MRR KPI cards, admin-modifiable
      hourly overage rate + concurrent big-room fee rate
- [ ] `app/admin/organizations/page.tsx` + `[id]/page.tsx` — Orgs CRUD,
      signup-code regenerator, member list, share-URL copy-to-clipboard,
      Layer 3 RBAC in each handler
- [ ] `app/admin/recordings/page.tsx` — bypass `participant_ids` filter via
      admin SDK, filters (org/date/status), per-recording detail, admin actions
      (download/delete/force-stop egress), storage growth chart (Recharts)
- [ ] `app/admin/rooms/page.tsx` — Appwrite Realtime sub on `active_rooms`,
      5s polling fallback, per-room drill-down at `[roomSid]/page.tsx`
- [ ] Per-room participant table — full field set per spec §6.5 (identity,
      name, email-if-same-org, kind badges, region, SDK info, IP from
      `session_logs`, per-track encryption badge)
- [ ] Disclosure banner pinned to room views
- [ ] Admin actions per room: end-for-everyone, force-stop recording, kick
      participant — gated by org boundary
- [ ] `app/admin/branding/page.tsx` — `org_branding` CRUD, logo upload,
      primary/accent color, custom domain (Enterprise only — DNS verification
      flow deferred to Phase 2)
- [ ] `lib/components/Header.tsx` — `/admin` link in avatar dropdown when
      `isOrgAdmin AND plan ∈ {business, enterprise}`
- [ ] `pnpm vitest run` + `pnpm build` — all green
- [ ] Manual smoke per spec §10 acceptance criteria
- [ ] Commit + push as `feat(pricing-3e): admin features (Pricing, Orgs, Recordings, Rooms, Branding)`

---

## Post-PR: refresh ancillary docs

- [ ] Refresh `docs/dvai-connect-cost-and-pricing-analysis.docx` — Tab 2
      pricing, strip STT line items (Deepgram removed), update margins, add
      recording-server-side-encryption disclosure
- [ ] Archive `docs/superpowers/specs/2026-04-30-payments-strawman.md` —
      add SUPERSEDED banner pointing at this plan + the new spec
- [ ] Update `CLAUDE.md` with the new tier system + Deepgram-removed
      transcription floor
