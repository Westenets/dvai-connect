import 'server-only';
import type Stripe from 'stripe';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { requireStripe } from '@/lib/stripe';
import {
    requireStripePriceId,
    STRIPE_CHECKOUT_SUCCESS_URL,
    STRIPE_CHECKOUT_CANCEL_URL,
    STRIPE_PORTAL_CONFIG_AFRICA,
    STRIPE_PORTAL_CONFIG_DEFAULT,
    STRIPE_PORTAL_RETURN_URL,
    type PaidTierId,
} from '@/lib/pricing/stripe-config';

/**
 * Server-only Stripe actions: Checkout Session creation and Customer
 * Portal Session creation. Both consume the runtime app's restricted
 * Stripe key (rk_…).
 *
 * Customer lookup pattern: we never store the Stripe customer id on the
 * Appwrite user record. Instead the source of truth is the
 * `subscriptions` collection — if a user has *any* prior subscription
 * row, its `stripeCustomerId` is reused. If not, we create a new
 * Stripe customer with `metadata.appwrite_user_id` set so manual ops
 * can reconcile later.
 *
 * NOTE: webhook-side processing (PR 3b chunk 3) is what actually writes
 * the subscriptions row. These actions only READ to find the customer
 * id, or create a new Stripe customer on first checkout.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const SUBSCRIPTIONS_COLLECTION = 'subscriptions';

function buildAdminClient(): ServerClient | null {
    if (!API_KEY) return null;
    return new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
}

/** Look up the Stripe customer id we've previously associated with this
 *  Appwrite user. Returns null when no prior subscription exists. */
export async function findStripeCustomerForUser(userId: string): Promise<string | null> {
    const client = buildAdminClient();
    if (!client) return null;
    try {
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COLLECTION, [
            Query.equal('userId', userId),
            Query.limit(1),
        ]);
        const sub = res.documents[0] as unknown as { stripeCustomerId?: string } | undefined;
        return sub?.stripeCustomerId ?? null;
    } catch (err: any) {
        console.warn('[actions/stripe] findStripeCustomerForUser failed:', err?.message ?? err);
        return null;
    }
}

/**
 * Idempotent helper: returns an existing Stripe customer id for the
 * user if one exists, otherwise creates a new one. The new customer is
 * tagged with metadata that lets server-side reconciliation map it back
 * to the Appwrite user.
 */
export async function getOrCreateStripeCustomer(opts: {
    userId: string;
    email: string;
    name?: string;
}): Promise<string> {
    const existing = await findStripeCustomerForUser(opts.userId);
    if (existing) return existing;
    const stripe = requireStripe();
    const customer = await stripe.customers.create({
        email: opts.email,
        name: opts.name,
        metadata: {
            appwrite_user_id: opts.userId,
        },
    });
    return customer.id;
}

export interface CreateCheckoutSessionInput {
    userId: string;
    userEmail: string;
    userName?: string;
    tier: PaidTierId;
    /** Per-member quantity for pro_africa (each cohort member is one
     *  subscription quantity). For pro / business / enterprise this is
     *  ignored and forced to 1 — those are per-org SKUs. */
    quantity?: number;
    /** Africa cohort signup code, when applicable. Stored on the
     *  Checkout Session metadata so the webhook can later mint a
     *  Subscription Schedule wrapping the resulting subscription. */
    signupCode?: string;
    /** Optional override; defaults to STRIPE_CHECKOUT_SUCCESS_URL env. */
    successUrl?: string;
    cancelUrl?: string;
}

/**
 * Create an Embedded Checkout Session for the given user + tier.
 *
 * Returns the session's `client_secret` (consumed by Stripe Checkout's
 * embedded UI on the client) and the session id (used for verification
 * on the success page).
 *
 * We don't pass `payment_method_types` — dynamic payment methods is the
 * default and matches Stripe best practices.
 */
export async function createCheckoutSession(
    input: CreateCheckoutSessionInput,
): Promise<{ clientSecret: string; sessionId: string }> {
    const stripe = requireStripe();
    const priceId = requireStripePriceId(input.tier);
    const customerId = await getOrCreateStripeCustomer({
        userId: input.userId,
        email: input.userEmail,
        name: input.userName,
    });
    const quantity = input.tier === 'pro_africa' ? Math.max(1, input.quantity ?? 1) : 1;

    const metadata: Stripe.MetadataParam = {
        appwrite_user_id: input.userId,
        dvai_tier: input.tier,
    };
    if (input.signupCode) metadata.dvai_signup_code = input.signupCode;
    if (input.tier === 'pro_africa') {
        metadata.dvai_africa_commitment_months = '24';
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ui_mode: 'embedded_page',
        customer: customerId,
        client_reference_id: input.userId,
        line_items: [{ price: priceId, quantity }],
        // Per Stripe best-practices skill: NEVER pass payment_method_types.
        // automatic_tax requires Stripe Tax to be enabled in the dashboard.
        // Sandbox doesn't allow that (live mode only), so guard the flag.
        automatic_tax: process.env.STRIPE_TAX_ENABLED === 'true' ? { enabled: true } : undefined,
        subscription_data: {
            metadata,
        },
        metadata,
        return_url: input.successUrl ?? STRIPE_CHECKOUT_SUCCESS_URL(),
        // Embedded Checkout uses `return_url` not success_url/cancel_url —
        // cancel is implicit (close the embedded UI). cancelUrl is kept
        // on the input for forward-compatibility if we switch back to
        // hosted Checkout in the future.
    });

    if (!session.client_secret) {
        throw new Error('[actions/stripe] Stripe did not return a client_secret');
    }
    return { clientSecret: session.client_secret, sessionId: session.id };
}

export interface CreatePortalSessionInput {
    userId: string;
    isAfricaCohort?: boolean;
    /** Optional override; defaults to STRIPE_PORTAL_RETURN_URL env. */
    returnUrl?: string;
}

/**
 * Create a Customer Portal session so the user can manage their
 * payment method, view invoices, change plans (if not Africa cohort),
 * and cancel (if not Africa cohort).
 */
export async function createPortalSession(
    input: CreatePortalSessionInput,
): Promise<{ url: string }> {
    const stripe = requireStripe();
    const customerId = await findStripeCustomerForUser(input.userId);
    if (!customerId) {
        throw new Error(
            '[actions/stripe] User has no Stripe customer — they have not subscribed yet',
        );
    }
    const configurationId = input.isAfricaCohort
        ? STRIPE_PORTAL_CONFIG_AFRICA()
        : STRIPE_PORTAL_CONFIG_DEFAULT();

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: configurationId || undefined,
        return_url: input.returnUrl ?? STRIPE_PORTAL_RETURN_URL(),
    });
    return { url: session.url };
}
