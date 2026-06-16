import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases, ID } from 'node-appwrite';
import { requireStripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook receiver. Two responsibilities:
 *   1. Verify the Stripe signature (HMAC of raw body using
 *      STRIPE_WEBHOOK_SECRET). Reject 400 on mismatch.
 *   2. Append the event to the stripe_events Appwrite collection,
 *      using event.id as the idempotency key. Unique-key violation
 *      means we've already received this event; treat as success.
 *
 * Returns 200 in <100ms typical, never blocking on subscription state
 * mutation. The actual state apply happens in
 * /api/cron/process-stripe-events on a separate cron loop.
 *
 * IMPORTANT: this route MUST receive the raw body for signature
 * verification — `await request.text()` is correct; do NOT use
 * `request.json()` (it pre-parses and breaks the HMAC).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

const ALREADY_EXISTS_RE = /already exists|duplicate|unique/i;

export async function POST(request: Request) {
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }
    if (!STRIPE_WEBHOOK_SECRET) {
        console.error('[webhooks/stripe] STRIPE_WEBHOOK_SECRET not configured');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const rawBody = await request.text();

    const stripe = requireStripe();
    let event;
    try {
        event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            STRIPE_WEBHOOK_SECRET,
        );
    } catch (err: any) {
        console.warn('[webhooks/stripe] signature verification failed:', err?.message ?? err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (!API_KEY) {
        // No Appwrite admin client → we can't persist; log and 200 so
        // Stripe doesn't retry (the event is lost, but a retry on a
        // misconfigured server doesn't help). Surface via monitoring.
        console.error('[webhooks/stripe] APPWRITE_API_KEY missing — event dropped:', event.id);
        return NextResponse.json({ received: true, dropped: true }, { status: 200 });
    }

    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    const databases = new ServerDatabases(client);

    try {
        await databases.createDocument(DB_ID, 'stripe_events', ID.unique(), {
            eventId: event.id,
            type: event.type,
            payload: rawBody, // store raw — preserves Stripe's signed bytes
            processed: false,
        });
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (ALREADY_EXISTS_RE.test(msg)) {
            // Duplicate eventId — idempotent retry from Stripe. Treat
            // as success.
            return NextResponse.json({ received: true, duplicate: true });
        }
        console.error('[webhooks/stripe] failed to persist event', event.id, ':', msg);
        // Returning 500 will trigger Stripe to retry — which is what we
        // want for transient persistence errors.
        return NextResponse.json({ error: 'Persist failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true, eventId: event.id });
}
