/**
 * Single source of truth for tier definitions.
 *
 * Read by:
 *   - public /pricing route (server component)
 *   - admin Pricing CRUD (display field overrides)
 *   - paid-feature gates: agent quota, attendee cap, meeting length,
 *     cloud recording access
 *   - tier resolution in lib/auth/subscription.ts
 *
 * Base price values are duplicated in Stripe (single source of truth for
 * what gets charged). Display fields (name, badges, description, feature
 * checkmarks) are editable from the admin panel and persisted in Appwrite
 * collection `pricing_tiers` — at runtime we merge the static defaults
 * below with the admin-edited overrides.
 *
 * Locked pricing comes from Tab 2 of the user's 2026-06-13 cost analysis
 * MD file. See docs/superpowers/specs/2026-06-13-pricing-admin-design.md
 * for the full pricing rationale and feature gate breakdown.
 */

export type TierId = 'free' | 'pro_africa' | 'pro' | 'business' | 'enterprise';

export type SalesMotion = 'self-serve' | 'sales-assisted' | 'sales-led';
export type SupportLevel = 'community' | '24-7';

export interface TierDefinition {
    id: TierId;
    displayName: string;
    badge?: string;
    /** USD/month. 0 for Free. */
    basePriceUsd: number;
    /** Stripe Price ID. Filled in via env var at runtime — admin Pricing CRUD
     *  can rotate it when Stripe price values change. */
    stripePriceIdEnvVar: string | null;
    /** Hard cap. Free 40min, Pro 60min, Business 60min (+ admin-set hourly
     *  overage), Enterprise 180min (+ admin-set overage). */
    meetingMaxMinutes: number;
    /** Hard cap for total room participants. */
    attendeeCap: number;
    /** Cloud recording feature enabled. */
    cloudRecording: boolean;
    /** Concurrent meeting agents allowed in one room. */
    meetingAgentQuota: number;
    notetaking: boolean;
    screenShare: boolean;
    customBranding: boolean;
    adminDashboard: boolean;
    dedicatedNode: boolean;
    support: SupportLevel;
    /** E2EE is true for every tier. This is the structural moat. */
    e2ee: true;
    sales: SalesMotion;
    /** True for SKUs that require an invite code (Pro Africa). */
    cohortRestricted: boolean;
    /** True for Pro Africa (24-month minimum commitment). */
    hasCommitment: boolean;
}

export const TIERS: Record<TierId, TierDefinition> = {
    free: {
        id: 'free',
        displayName: 'Free',
        basePriceUsd: 0,
        stripePriceIdEnvVar: null,
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
        hasCommitment: false,
    },
    pro_africa: {
        id: 'pro_africa',
        displayName: 'Pro (Africa Cohort)',
        badge: 'Cohort program',
        basePriceUsd: 14.99,
        stripePriceIdEnvVar: 'STRIPE_PRICE_ID_PRO_AFRICA',
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
        hasCommitment: true, // 24-month
    },
    pro: {
        id: 'pro',
        displayName: 'Pro',
        basePriceUsd: 18.99,
        stripePriceIdEnvVar: 'STRIPE_PRICE_ID_PRO',
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
        hasCommitment: false,
    },
    business: {
        id: 'business',
        displayName: 'Business',
        badge: 'Most popular',
        basePriceUsd: 48.99,
        stripePriceIdEnvVar: 'STRIPE_PRICE_ID_BUSINESS',
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
        hasCommitment: false,
    },
    enterprise: {
        id: 'enterprise',
        displayName: 'Enterprise',
        basePriceUsd: 449.99,
        stripePriceIdEnvVar: 'STRIPE_PRICE_ID_ENTERPRISE',
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
        hasCommitment: false,
    },
};

/** Tiers visible on the public pricing page. Pro Africa is hidden behind
 *  cohort eligibility — accessible only via signed invite URL. */
export const VISIBLE_PUBLIC_TIER_IDS: readonly TierId[] = [
    'free',
    'pro',
    'business',
    'enterprise',
] as const;

/** Get the Stripe Price ID for a tier at runtime. Returns null for free
 *  tier or when the env var isn't set (which means tier isn't purchasable
 *  yet). */
export function getStripePriceId(tierId: TierId): string | null {
    const def = TIERS[tierId];
    if (!def.stripePriceIdEnvVar) return null;
    return process.env[def.stripePriceIdEnvVar] ?? null;
}

/** Get the tier definition for a TierId. */
export function getTier(tierId: TierId): TierDefinition {
    return TIERS[tierId];
}

/** True if a tier ALLOWS recording. */
export function tierAllowsRecording(tierId: TierId): boolean {
    return TIERS[tierId].cloudRecording;
}

/** True if a tier allows N concurrent agents. */
export function tierAllowsAgents(tierId: TierId, currentCount: number): boolean {
    return currentCount < TIERS[tierId].meetingAgentQuota;
}

/** True if a tier allows N total participants. */
export function tierAllowsAttendees(tierId: TierId, currentCount: number): boolean {
    return currentCount < TIERS[tierId].attendeeCap;
}

/** Get a tier's max meeting length in seconds. */
export function tierMeetingMaxSeconds(tierId: TierId): number {
    return TIERS[tierId].meetingMaxMinutes * 60;
}
