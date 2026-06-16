import 'server-only';
import type Stripe from 'stripe';
import { Query } from 'node-appwrite';
import { EVENT_HANDLERS, type HandlerDeps } from './handlers';

/**
 * Shared drain primitives. Used by:
 *   - /api/cron/process-stripe-events   → drainPendingEvents (FIFO, batch)
 *   - /api/checkout/verify              → drainEventsForSession (targeted)
 *
 * Both routes converge on processStripeEvent so the side effects
 * (handler dispatch + idempotency flip) live in exactly one place.
 *
 * On handler failure the event is still marked processed=true with the
 * error message captured — cron MUST NOT keep retrying a poison
 * payload, and the inline drain inherits the same guarantee.
 */

const COLLECTION = 'stripe_events';

export interface StripeEventDoc {
    $id: string;
    eventId: string;
    type: string;
    payload: string;
    processed?: boolean;
}

/**
 * Apply one event's handler and mark the row processed. Returns 'ok'
 * when the handler completed cleanly, 'error' when it threw (the row
 * is still marked processed=true so neither cron nor inline drain
 * will re-attempt — see `error` field for the captured message).
 */
export async function processStripeEvent(
    deps: HandlerDeps,
    doc: StripeEventDoc,
): Promise<'ok' | 'error'> {
    try {
        const event = JSON.parse(doc.payload) as Stripe.Event;
        const handler = EVENT_HANDLERS[event.type];
        if (handler) await handler(deps, event);
        await deps.databases.updateDocument(deps.dbId, COLLECTION, doc.$id, {
            processed: true,
            processedAt: new Date().toISOString(),
        });
        return 'ok';
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('[stripe-events] event', doc.eventId, 'type=' + doc.type, 'failed:', msg);
        try {
            await deps.databases.updateDocument(deps.dbId, COLLECTION, doc.$id, {
                processed: true,
                processedAt: new Date().toISOString(),
                error: msg.slice(0, 2000),
            });
        } catch (markErr: any) {
            console.error('[stripe-events] could not mark errored:', markErr?.message ?? markErr);
        }
        return 'error';
    }
}

/**
 * FIFO drain — pulls up to `batch` unprocessed events oldest-first and
 * runs them through processStripeEvent. Returns counts plus `drained`
 * (true when the queue was emptied by this call).
 */
export async function drainPendingEvents(
    deps: HandlerDeps,
    batch: number,
): Promise<{ processed: number; errored: number; drained: boolean }> {
    const queue = await deps.databases.listDocuments(deps.dbId, COLLECTION, [
        Query.equal('processed', false),
        Query.orderAsc('$createdAt'),
        Query.limit(batch),
    ]);
    if (queue.documents.length === 0) {
        return { processed: 0, errored: 0, drained: true };
    }
    let processed = 0;
    let errored = 0;
    for (const raw of queue.documents) {
        const result = await processStripeEvent(deps, raw as unknown as StripeEventDoc);
        if (result === 'ok') processed++;
        else errored++;
    }
    return {
        processed,
        errored,
        drained: queue.documents.length < batch,
    };
}

/**
 * Targeted drain — pull unprocessed events and apply only those tied
 * to a specific Checkout Session and its resulting Subscription.
 * Called by /api/checkout/verify when the polling client is waiting
 * for the subscriptions row but the cron hasn't drained yet.
 *
 * Other events in the queue are left untouched; they remain the
 * cron's job. This bounds inline-drain wall-time to O(events for this
 * checkout) instead of O(whole queue).
 *
 * Race semantics: if the cron and the inline drain pick the same
 * event concurrently, both will run the handler. The handlers in
 * `lib/stripe-events/handlers.ts` use existing-or-create patterns
 * keyed on stripeSubscriptionId, so duplicate runs converge on a
 * single row rather than producing duplicates. The race window is
 * ~tens of ms; acceptable given the cron only fires once per minute.
 */
export async function drainEventsForSession(
    deps: HandlerDeps,
    opts: { sessionId: string; subscriptionId: string },
): Promise<{ processed: number; errored: number; matched: number }> {
    const queue = await deps.databases.listDocuments(deps.dbId, COLLECTION, [
        Query.equal('processed', false),
        Query.orderAsc('$createdAt'),
        Query.limit(50),
    ]);
    let processed = 0;
    let errored = 0;
    let matched = 0;
    for (const raw of queue.documents) {
        const doc = raw as unknown as StripeEventDoc;
        let event: Stripe.Event;
        try {
            event = JSON.parse(doc.payload) as Stripe.Event;
        } catch {
            continue;
        }
        if (!eventMatchesSession(event, opts.sessionId, opts.subscriptionId)) continue;
        matched++;
        const result = await processStripeEvent(deps, doc);
        if (result === 'ok') processed++;
        else errored++;
    }
    return { processed, errored, matched };
}

function eventMatchesSession(
    event: Stripe.Event,
    sessionId: string,
    subscriptionId: string,
): boolean {
    // event.data.object is a union of every Stripe resource type;
    // bridge through `unknown` because the shape we care about
    // (`id`, `parent.subscription_details.subscription`) lives on a
    // subset, and TypeScript won't narrow without an explicit cast.
    const obj = event.data.object as unknown as { id?: string };
    if (event.type === 'checkout.session.completed') {
        return obj.id === sessionId;
    }
    if (event.type.startsWith('customer.subscription.')) {
        return obj.id === subscriptionId;
    }
    if (event.type.startsWith('invoice.')) {
        const invoice = event.data.object as unknown as Stripe.Invoice;
        const parent = invoice.parent;
        if (parent?.type !== 'subscription_details') return false;
        const ref = parent.subscription_details?.subscription;
        const subStr = typeof ref === 'string' ? ref : ref?.id;
        return subStr === subscriptionId;
    }
    return false;
}
