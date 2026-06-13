import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import type { TierId } from '@/lib/pricing/tiers';

/**
 * User-tier resolution. Reads from the Appwrite `subscriptions`
 * collection (populated by the Stripe webhook event processor —
 * lib/stripe-events/handlers.ts).
 *
 * Server-side only. React components consume the resolved tier from
 * AuthProvider context, which calls these helpers once at login.
 *
 * Behavior when subscriptions can't be queried (env unset, collection
 * not migrated yet, network error): returns `'free'` — the safest
 * default that keeps unauthenticated and unpaid flows working.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

// Cache user→tier for the lifetime of the request. The cache lives on
// `globalThis` to survive Next's per-route module isolation but is keyed
// on a tuple that includes the userId — bounded by the number of users
// hitting the API in a given process. Cleared every 60s via the TTL
// comparison.
const CACHE_TTL_MS = 60_000;
interface CacheEntry {
    tier: TierId;
    expiresAt: number;
}
const cache: Map<string, CacheEntry> = (globalThis as any).__dvaiTierCache__ ?? new Map();
(globalThis as any).__dvaiTierCache__ = cache;

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

function buildClient(): ServerClient | null {
    if (!ENDPOINT || !PROJECT || !API_KEY) return null;
    return new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
}

export async function getUserPlan(userId: string): Promise<TierId> {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.tier;

    const client = buildClient();
    if (!client) {
        // Misconfigured environment — default to free so paywalls stay
        // protective and free features keep working.
        const tier: TierId = 'free';
        cache.set(userId, { tier, expiresAt: Date.now() + CACHE_TTL_MS });
        return tier;
    }

    let tier: TierId = 'free';
    try {
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'subscriptions', [
            Query.equal('userId', userId),
            Query.equal('status', ACTIVE_STATUSES),
            Query.orderDesc('$updatedAt'),
            Query.limit(1),
        ]);
        const doc = res.documents[0] as { tier?: TierId } | undefined;
        if (doc?.tier) tier = doc.tier;
    } catch (err: any) {
        // Collection missing (migration not yet run) → log once and
        // fall through to 'free'. Don't retry; cache the answer for
        // the TTL so we don't spam Appwrite with failing lookups.
        const msg = err?.message ?? String(err);
        if (!msg.includes('not found')) {
            console.warn('[auth/subscription] getUserPlan failed for', userId, ':', msg);
        }
    }

    cache.set(userId, { tier, expiresAt: Date.now() + CACHE_TTL_MS });
    return tier;
}

export async function isPaidUser(userId: string): Promise<boolean> {
    const tier = await getUserPlan(userId);
    return tier !== 'free';
}

/** Test-only — flush the in-memory cache between vi tests. */
export function __clearUserPlanCache() {
    cache.clear();
}
