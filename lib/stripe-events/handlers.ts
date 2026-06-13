import 'server-only';
import type Stripe from 'stripe';
import { Client as ServerClient, Databases as ServerDatabases, Query, ID } from 'node-appwrite';
import { requireStripe } from '@/lib/stripe';
import { getTierByStripePriceId, type PaidTierId } from '@/lib/pricing/stripe-config';
import {
    AFRICA_COMMITMENT_MONTHS,
    wrapAfricaSubscriptionWithCommitment,
} from '@/lib/africa/commitment';
import type { TierId } from '@/lib/pricing/tiers';

/**
 * Stripe event handlers. Each consumes a parsed Stripe.Event and
 * applies the resulting state mutation to the Appwrite subscriptions
 * collection.
 *
 * Pulled into its own module so the event processor cron is a thin
 * orchestration loop and the actual write logic is unit-testable
 * (handlers take their dependencies as args).
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const SUBSCRIPTIONS = 'subscriptions';

export interface HandlerDeps {
    stripe: Stripe;
    databases: ServerDatabases;
    dbId: string;
}

export function buildHandlerDeps(): HandlerDeps {
    if (!API_KEY) throw new Error('[stripe-events] APPWRITE_API_KEY required');
    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    return {
        stripe: requireStripe(),
        databases: new ServerDatabases(client),
        dbId: DB_ID,
    };
}

interface SubscriptionDoc {
    $id: string;
    userId: string;
    orgId?: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeScheduleId?: string;
    tier: TierId;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd?: boolean;
    isAfricaCohort?: boolean;
    africaCohortCode?: string;
    africaCommitmentEnd?: string;
    priceId: string;
}

async function findSubscriptionDoc(
    deps: HandlerDeps,
    stripeSubscriptionId: string,
): Promise<SubscriptionDoc | null> {
    const res = await deps.databases.listDocuments(deps.dbId, SUBSCRIPTIONS, [
        Query.equal('stripeSubscriptionId', stripeSubscriptionId),
        Query.limit(1),
    ]);
    return (res.documents[0] as unknown as SubscriptionDoc) ?? null;
}

function epochToIso(seconds: number | null | undefined): string {
    if (!seconds) return new Date().toISOString();
    return new Date(seconds * 1000).toISOString();
}

function asString(v: string | { id: string } | null | undefined): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v : v.id;
}

/**
 * Pull the subscription id out of an Invoice. In API 2026-05-27.dahlia
 * the field moved from `invoice.subscription` to
 * `invoice.parent.subscription_details.subscription` (when
 * `parent.type === 'subscription_details'`). Returns null for
 * invoices not tied to a subscription (manual invoices, one-off
 * charges, etc).
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const parent = invoice.parent;
    if (!parent || parent.type !== 'subscription_details') return null;
    return asString(parent.subscription_details?.subscription ?? null);
}

/**
 * checkout.session.completed
 *
 * Mints a subscriptions row for a brand-new subscription. For Africa
 * cohort tier, additionally wraps the resulting subscription in a
 * Subscription Schedule with a 24-iteration commitment phase.
 */
export async function handleCheckoutSessionCompleted(
    deps: HandlerDeps,
    event: Stripe.Event,
): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== 'subscription') return;
    const subId = asString(session.subscription);
    const customerId = asString(session.customer);
    const userId = session.metadata?.appwrite_user_id ?? session.client_reference_id;
    const tier = session.metadata?.dvai_tier as PaidTierId | undefined;
    if (!subId || !customerId || !userId || !tier) {
        console.warn('[stripe-events/checkout.completed] missing key fields:', {
            subId, customerId, userId, tier, eventId: event.id,
        });
        return;
    }
    const sub = await deps.stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    const priceId = item?.price?.id;
    const resolvedTier: TierId = priceId ? getTierByStripePriceId(priceId) ?? tier : tier;

    const isAfrica = resolvedTier === 'pro_africa';
    const signupCode = session.metadata?.dvai_signup_code;
    let scheduleId: string | undefined;
    let commitmentEndsAt: string | undefined;
    if (isAfrica && signupCode) {
        const wrap = await wrapAfricaSubscriptionWithCommitment({
            subscriptionId: subId,
            signupCode,
            commitmentEndsAt: null,
        });
        scheduleId = wrap.scheduleId;
        commitmentEndsAt = wrap.commitmentEndsAt;
    } else if (isAfrica && !signupCode) {
        console.warn(
            '[stripe-events/checkout.completed] pro_africa checkout without signup code — ' +
                'no commitment schedule will be attached. event:',
            event.id,
        );
    }

    const existing = await findSubscriptionDoc(deps, subId);
    const fields: Record<string, unknown> = {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        tier: resolvedTier,
        status: sub.status,
        currentPeriodStart: epochToIso(item?.current_period_start),
        currentPeriodEnd: epochToIso(item?.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        isAfricaCohort: isAfrica,
        priceId: priceId ?? '',
    };
    if (signupCode) fields.africaCohortCode = signupCode;
    if (commitmentEndsAt) fields.africaCommitmentEnd = commitmentEndsAt;
    if (scheduleId) fields.stripeScheduleId = scheduleId;

    if (existing) {
        await deps.databases.updateDocument(deps.dbId, SUBSCRIPTIONS, existing.$id, fields);
    } else {
        await deps.databases.createDocument(
            deps.dbId,
            SUBSCRIPTIONS,
            ID.unique(),
            fields,
        );
    }
}

/**
 * customer.subscription.updated — sync status, period, tier (if price
 * changed via portal upgrade), and cancellation state.
 */
export async function handleSubscriptionUpdated(
    deps: HandlerDeps,
    event: Stripe.Event,
): Promise<void> {
    const sub = event.data.object as Stripe.Subscription;
    const doc = await findSubscriptionDoc(deps, sub.id);
    if (!doc) {
        console.warn(
            '[stripe-events/subscription.updated] no local row for',
            sub.id,
            '— may arrive before checkout.completed; ignoring',
        );
        return;
    }
    const item = sub.items.data[0];
    const newPriceId = item?.price?.id;
    const resolvedTier = newPriceId ? getTierByStripePriceId(newPriceId) : null;
    const updates: Record<string, unknown> = {
        status: sub.status,
        currentPeriodStart: epochToIso(item?.current_period_start),
        currentPeriodEnd: epochToIso(item?.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    };
    if (newPriceId) updates.priceId = newPriceId;
    if (resolvedTier && resolvedTier !== doc.tier) {
        updates.tier = resolvedTier;
    } else if (newPriceId && !resolvedTier) {
        console.warn(
            '[stripe-events/subscription.updated] price id',
            newPriceId,
            'has no tier mapping — leaving tier as',
            doc.tier,
        );
    }
    await deps.databases.updateDocument(deps.dbId, SUBSCRIPTIONS, doc.$id, updates);
}

/**
 * customer.subscription.deleted — terminal cancellation.
 */
export async function handleSubscriptionDeleted(
    deps: HandlerDeps,
    event: Stripe.Event,
): Promise<void> {
    const sub = event.data.object as Stripe.Subscription;
    const doc = await findSubscriptionDoc(deps, sub.id);
    if (!doc) return;
    const lastPeriodEnd = sub.ended_at ?? sub.items.data[0]?.current_period_end;
    await deps.databases.updateDocument(deps.dbId, SUBSCRIPTIONS, doc.$id, {
        status: 'canceled',
        currentPeriodEnd: epochToIso(lastPeriodEnd),
        cancelAtPeriodEnd: false,
    });
}

/**
 * invoice.paid — extends the current period.
 */
export async function handleInvoicePaid(
    deps: HandlerDeps,
    event: Stripe.Event,
): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = invoiceSubscriptionId(invoice);
    if (!subId) return;
    const doc = await findSubscriptionDoc(deps, subId);
    if (!doc) return;
    const updates: Record<string, unknown> = {
        status: 'active',
    };
    if (invoice.period_end) updates.currentPeriodEnd = epochToIso(invoice.period_end);
    if (invoice.period_start) updates.currentPeriodStart = epochToIso(invoice.period_start);
    await deps.databases.updateDocument(deps.dbId, SUBSCRIPTIONS, doc.$id, updates);
}

/**
 * invoice.payment_failed — surfaces past_due so the app can prompt
 * the user to update their card from the Customer Portal.
 */
export async function handleInvoicePaymentFailed(
    deps: HandlerDeps,
    event: Stripe.Event,
): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = invoiceSubscriptionId(invoice);
    if (!subId) return;
    const doc = await findSubscriptionDoc(deps, subId);
    if (!doc) return;
    await deps.databases.updateDocument(deps.dbId, SUBSCRIPTIONS, doc.$id, {
        status: 'past_due',
    });
}

/** Dispatch table — keyed on Stripe event.type. Unknown types are no-ops. */
export const EVENT_HANDLERS: Record<
    string,
    (deps: HandlerDeps, event: Stripe.Event) => Promise<void>
> = {
    'checkout.session.completed': handleCheckoutSessionCompleted,
    'customer.subscription.created': handleSubscriptionUpdated,
    'customer.subscription.updated': handleSubscriptionUpdated,
    'customer.subscription.deleted': handleSubscriptionDeleted,
    'invoice.paid': handleInvoicePaid,
    'invoice.payment_succeeded': handleInvoicePaid, // alias on older Stripe API versions
    'invoice.payment_failed': handleInvoicePaymentFailed,
};

export { AFRICA_COMMITMENT_MONTHS };
