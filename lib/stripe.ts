import Stripe from 'stripe';

/**
 * Server-side Stripe SDK client.
 *
 * Prefers STRIPE_RESTRICTED_KEY (rk_…) over STRIPE_SECRET_KEY (sk_…) per
 * Stripe best practices — the meet app's runtime only needs a scoped key
 * (Checkout Sessions write, Customer Portal Sessions write, Subscriptions
 * read/write, Subscription Schedules read/write, Billing Meter Events
 * write, Prices/Products/Invoices/Customers/Webhook Endpoints read).
 *
 * STRIPE_SECRET_KEY remains in the local shell only for the one-off
 * setup script (scripts/stripe-setup-2026-06-13.mjs) and is never read
 * by the running app.
 *
 * Returns null when no key is configured so build-time imports don't
 * crash; callers must use requireStripe() in any code path that runs
 * with billing enabled.
 */

const KEY = process.env.STRIPE_RESTRICTED_KEY ?? process.env.STRIPE_SECRET_KEY ?? '';

export const STRIPE_API_VERSION = '2026-05-27.dahlia' as const;

export const stripe: Stripe | null = KEY
    ? new Stripe(KEY, { apiVersion: STRIPE_API_VERSION })
    : null;

export function requireStripe(): Stripe {
    if (!stripe) {
        throw new Error(
            '[stripe] No Stripe key configured. Set STRIPE_RESTRICTED_KEY (preferred) ' +
                'or STRIPE_SECRET_KEY in .env.local.',
        );
    }
    return stripe;
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export const PAID_FEATURE_GATES_ENABLED =
    (process.env.PAID_FEATURE_GATES_ENABLED ?? 'false').toLowerCase() === 'true';
