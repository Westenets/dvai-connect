import { NextResponse } from 'next/server';
import { requireStripe } from '@/lib/stripe';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { getCurrentUser } from '@/lib/auth/session';
import { buildHandlerDeps } from '@/lib/stripe-events/handlers';
import { drainEventsForSession } from '@/lib/stripe-events/drain';

/**
 * GET /api/checkout/verify?session_id=cs_test_…
 *
 * Confirms a Checkout Session reached `complete` status on Stripe AND
 * that the matching subscription row has been mirrored into our
 * Appwrite `subscriptions` collection by the webhook event processor.
 *
 * The /checkout/success page polls this until status === 'ready' (or
 * gives up after a timeout). Either side can be the slower one — the
 * webhook ack typically lands in <1s but the cron-driven event drain
 * runs every minute.
 *
 * Returns:
 *   { status: 'pending' | 'ready' | 'failed', tier?, message? }
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ status: 'failed', message: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) {
        return NextResponse.json(
            { status: 'failed', message: 'session_id query param required' },
            { status: 400 },
        );
    }

    const stripe = requireStripe();
    let session;
    try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err: any) {
        return NextResponse.json(
            { status: 'failed', message: err?.message ?? 'Stripe lookup failed' },
            { status: 400 },
        );
    }
    // Defense: the session must belong to this user (matches our
    // metadata.appwrite_user_id or client_reference_id).
    const userIdOnSession =
        session.metadata?.appwrite_user_id ?? session.client_reference_id ?? null;
    if (userIdOnSession && userIdOnSession !== user.$id) {
        return NextResponse.json(
            { status: 'failed', message: 'Session does not belong to this user' },
            { status: 403 },
        );
    }
    if (session.status !== 'complete') {
        return NextResponse.json({
            status: session.status === 'open' ? 'pending' : 'failed',
            message: `Stripe session status: ${session.status}`,
        });
    }
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        return NextResponse.json({
            status: 'pending',
            message: `Awaiting payment confirmation (status: ${session.payment_status})`,
        });
    }

    // Stripe says paid. Now check whether the webhook event processor
    // has reflected the subscription locally.
    const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subId) {
        return NextResponse.json({
            status: 'pending',
            message: 'Subscription not yet attached to session',
        });
    }
    if (!API_KEY) {
        // Stripe says ok but we can't introspect our DB. Treat as ready
        // — admin paths will still gate appropriately.
        return NextResponse.json({ status: 'ready', tier: session.metadata?.dvai_tier });
    }
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const lookup = async () =>
            (
                await databases.listDocuments(DB_ID, 'subscriptions', [
                    Query.equal('stripeSubscriptionId', subId),
                    Query.limit(1),
                ])
            ).documents[0] as unknown as { tier: string } | undefined;

        let doc = await lookup();
        if (!doc) {
            // Cron drains every minute, but the polling client checks
            // every 1.5s with a 60s timeout — so without an inline
            // drain the user can race the cron and see "Almost there"
            // even on the happy path. Do the cron's work for this
            // specific session right here, then re-check. The cron
            // remains the safety net for everything we don't touch.
            try {
                const drainDeps = buildHandlerDeps();
                await drainEventsForSession(drainDeps, {
                    sessionId,
                    subscriptionId: subId,
                });
                doc = await lookup();
            } catch (drainErr: any) {
                console.warn(
                    '[checkout/verify] inline drain failed:',
                    drainErr?.message ?? drainErr,
                );
            }
        }
        if (!doc) {
            return NextResponse.json({
                status: 'pending',
                message: 'Awaiting webhook drain into subscriptions collection',
            });
        }
        return NextResponse.json({ status: 'ready', tier: doc.tier });
    } catch (err: any) {
        return NextResponse.json({
            status: 'pending',
            message: `Subscriptions lookup transient error: ${err?.message ?? err}`,
        });
    }
}
