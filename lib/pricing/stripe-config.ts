import type { TierId } from './tiers';

/**
 * Stripe price-id ↔ tier mapping, driven entirely by env vars.
 *
 * The mapping is the runtime equivalent of the `stripePriceIdEnvVar`
 * field on each TierDefinition in tiers.ts. We keep it in a separate
 * module so it's trivial to consume from API routes without pulling in
 * the whole tier definition object.
 *
 * The Stripe setup script (scripts/stripe-setup-2026-06-13.mjs) creates
 * these prices and prints the env vars at the end of its run:
 *
 *   STRIPE_PRICE_ID_PRO_AFRICA=price_…
 *   STRIPE_PRICE_ID_PRO=price_…
 *   STRIPE_PRICE_ID_BUSINESS=price_…
 *   STRIPE_PRICE_ID_ENTERPRISE=price_…
 *   STRIPE_PRICE_ID_BUSINESS_EXTRA_HOUR=price_…
 *   STRIPE_PRICE_ID_ENTERPRISE_BIG_ROOM=price_…
 */

export type PaidTierId = Exclude<TierId, 'free'>;

export const STRIPE_PRICE_ENV_BY_TIER: Record<PaidTierId, string> = {
    pro_africa: 'STRIPE_PRICE_ID_PRO_AFRICA',
    pro: 'STRIPE_PRICE_ID_PRO',
    business: 'STRIPE_PRICE_ID_BUSINESS',
    enterprise: 'STRIPE_PRICE_ID_ENTERPRISE',
};

/** Metered prices are attached to base subscriptions when a customer
 *  exceeds tier limits (Business hourly overage, Enterprise concurrent
 *  big-room sessions). They never appear in checkout directly. */
export const STRIPE_METERED_PRICE_ENV = {
    business_extra_hour: 'STRIPE_PRICE_ID_BUSINESS_EXTRA_HOUR',
    enterprise_big_room: 'STRIPE_PRICE_ID_ENTERPRISE_BIG_ROOM',
} as const;

export const STRIPE_METER_ENV = {
    business_extra_hours: 'STRIPE_METER_BUSINESS_EXTRA_HOURS',
    concurrent_big_room: 'STRIPE_METER_CONCURRENT_BIG_ROOM',
} as const;

export function getStripePriceId(tier: TierId): string | null {
    if (tier === 'free') return null;
    return process.env[STRIPE_PRICE_ENV_BY_TIER[tier as PaidTierId]] ?? null;
}

export function requireStripePriceId(tier: PaidTierId): string {
    const id = getStripePriceId(tier);
    if (!id) {
        throw new Error(
            `[stripe-config] Missing env var ${STRIPE_PRICE_ENV_BY_TIER[tier]} for tier ${tier}`,
        );
    }
    return id;
}

/**
 * Reverse-lookup: given a Stripe price id (as it appears on a webhook
 * payload's subscription item), find which of our tiers it represents.
 * Returns null if the id doesn't match any configured tier — this can
 * happen if Stripe prices rotate without env vars being updated, in
 * which case the webhook handler should log and leave the existing
 * tier in place rather than blindly changing it.
 *
 * The mapping is computed lazily once and cached for the process
 * lifetime. Env vars are read once; restart the process to pick up
 * rotations.
 */
let TIER_BY_PRICE_ID_CACHE: Map<string, PaidTierId> | null = null;

export function getTierByStripePriceId(priceId: string): PaidTierId | null {
    if (!TIER_BY_PRICE_ID_CACHE) {
        const m = new Map<string, PaidTierId>();
        for (const [tier, envName] of Object.entries(STRIPE_PRICE_ENV_BY_TIER) as Array<
            [PaidTierId, string]
        >) {
            const id = process.env[envName];
            if (id) m.set(id, tier);
        }
        TIER_BY_PRICE_ID_CACHE = m;
    }
    return TIER_BY_PRICE_ID_CACHE.get(priceId) ?? null;
}

/** Test-only — reset the cache between vi tests that mutate env vars. */
export function __resetTierByPriceIdCache() {
    TIER_BY_PRICE_ID_CACHE = null;
}

export const STRIPE_PORTAL_CONFIG_DEFAULT = () =>
    process.env.STRIPE_PORTAL_CONFIG_DEFAULT ?? '';
export const STRIPE_PORTAL_CONFIG_AFRICA = () =>
    process.env.STRIPE_PORTAL_CONFIG_AFRICA ?? '';

export const STRIPE_PORTAL_RETURN_URL = () =>
    process.env.STRIPE_PORTAL_RETURN_URL ?? 'https://connect.deepvoiceai.co/settings';

export const STRIPE_CHECKOUT_SUCCESS_URL = () =>
    process.env.STRIPE_CHECKOUT_SUCCESS_URL ??
    'https://connect.deepvoiceai.co/checkout/success?session_id={CHECKOUT_SESSION_ID}';

export const STRIPE_CHECKOUT_CANCEL_URL = () =>
    process.env.STRIPE_CHECKOUT_CANCEL_URL ?? 'https://connect.deepvoiceai.co/pricing';
