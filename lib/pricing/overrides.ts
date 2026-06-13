import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { TIERS, type TierDefinition, type TierId } from './tiers';

/**
 * Server-only helper that merges the static lib/pricing/tiers.ts
 * defaults with the admin-editable overrides stored in the
 * `pricing_tiers` Appwrite collection.
 *
 * Behavior values (basePriceUsd, meetingMaxMinutes, attendeeCap,
 * feature flags) are NEVER overridable — those are the source of
 * truth for billing and gates. Only display copy is mergeable:
 * displayName, badge, description, headlineCopy, bullets[].
 *
 * Cached per-process for 5 minutes to avoid hammering Appwrite on
 * every /pricing render. Cache invalidates on
 * __resetPricingOverridesCache() (used by the admin save handler).
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface TierOverride {
    tier: TierId;
    displayName?: string;
    badge?: string;
    description?: string;
    headlineCopy?: string;
    bullets?: string[];
}

export type TierWithOverride = TierDefinition & {
    description?: string;
    headlineCopy?: string;
    bullets?: string[];
};

interface CacheEntry {
    expiresAt: number;
    byTier: Map<TierId, TierOverride>;
}

const cache: { current: CacheEntry | null } = ((globalThis as any).__dvaiPricingOverrides__ ??= {
    current: null,
});

function buildClient(): ServerClient | null {
    if (!ENDPOINT || !PROJECT || !API_KEY) return null;
    return new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
}

async function loadOverrides(): Promise<Map<TierId, TierOverride>> {
    if (cache.current && cache.current.expiresAt > Date.now()) {
        return cache.current.byTier;
    }
    const map = new Map<TierId, TierOverride>();
    const client = buildClient();
    if (!client) {
        cache.current = { expiresAt: Date.now() + CACHE_TTL_MS, byTier: map };
        return map;
    }
    try {
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'pricing_tiers', [Query.limit(100)]);
        for (const raw of res.documents) {
            const doc = raw as unknown as {
                tier: TierId;
                displayName?: string;
                badge?: string;
                description?: string;
                headlineCopy?: string;
                bulletJson?: string;
            };
            let bullets: string[] | undefined;
            if (doc.bulletJson) {
                try {
                    const parsed = JSON.parse(doc.bulletJson);
                    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
                        bullets = parsed;
                    }
                } catch {
                    // Malformed JSON — ignore the override and fall back.
                }
            }
            map.set(doc.tier, {
                tier: doc.tier,
                displayName: doc.displayName ?? undefined,
                badge: doc.badge ?? undefined,
                description: doc.description ?? undefined,
                headlineCopy: doc.headlineCopy ?? undefined,
                bullets,
            });
        }
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (!msg.includes('not found')) {
            console.warn('[pricing/overrides] load failed:', msg);
        }
    }
    cache.current = { expiresAt: Date.now() + CACHE_TTL_MS, byTier: map };
    return map;
}

export async function getTierWithOverride(id: TierId): Promise<TierWithOverride> {
    const overrides = await loadOverrides();
    const base = TIERS[id];
    const override = overrides.get(id);
    if (!override) return base;
    return {
        ...base,
        displayName: override.displayName ?? base.displayName,
        badge: override.badge ?? base.badge,
        description: override.description,
        headlineCopy: override.headlineCopy,
        bullets: override.bullets,
    };
}

export async function getAllOverrides(): Promise<Map<TierId, TierOverride>> {
    return loadOverrides();
}

/** Clear the in-process cache. Called by the admin save handler so
 *  edits take effect on the next /pricing render. */
export function __resetPricingOverridesCache() {
    cache.current = null;
}
