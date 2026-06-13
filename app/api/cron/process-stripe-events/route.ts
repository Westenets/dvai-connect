import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { buildHandlerDeps, EVENT_HANDLERS } from '@/lib/stripe-events/handlers';

/**
 * GET/POST /api/cron/process-stripe-events
 *
 * Drains unprocessed events from stripe_events and applies the state
 * mutation to the subscriptions collection via lib/stripe-events/handlers.
 *
 * Auth: CRON_SECRET via Authorization: Bearer header. Vercel Cron sets
 * this automatically when CRON_SECRET is configured in the project
 * env. External cron services (e.g. cron-job.org pinging the URL)
 * must include the same header. We support both GET and POST so the
 * usual `curl -H` and `vercel.json` cron config both work.
 *
 * Behavior:
 *   - Pulls up to 50 unprocessed events per invocation (older first).
 *   - For each event: dispatch via EVENT_HANDLERS, mark processed=true
 *     with processedAt set. On handler failure, mark processed=true
 *     AND populate `error` with the message so we don't loop on a
 *     poison event — manual ops can inspect + reprocess after fix.
 *   - Returns { processed, errored }.
 *
 * Run cadence: every 1 minute is fine; can also drop to 15s if
 * webhook→admin-UI latency becomes a customer issue.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BATCH = 50;

interface StripeEventDoc {
    $id: string;
    eventId: string;
    type: string;
    payload: string;
    processed?: boolean;
    processedAt?: string;
    error?: string;
}

function authorized(request: Request): boolean {
    if (!CRON_SECRET) {
        // In dev we may want this to be callable without a secret. The
        // safer default is to require it; ops opts in by setting
        // CRON_SECRET_DEV_BYPASS=1 during local dev.
        return process.env.CRON_SECRET_DEV_BYPASS === '1';
    }
    const header = request.headers.get('authorization') ?? '';
    return header === `Bearer ${CRON_SECRET}`;
}

async function handle(request: Request) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!API_KEY) {
        return NextResponse.json(
            { error: 'APPWRITE_API_KEY not configured' },
            { status: 500 },
        );
    }
    const adminClient = new ServerClient()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT)
        .setKey(API_KEY);
    const databases = new ServerDatabases(adminClient);

    const queue = await databases.listDocuments(DB_ID, 'stripe_events', [
        Query.equal('processed', false),
        Query.orderAsc('$createdAt'),
        Query.limit(BATCH),
    ]);
    if (queue.documents.length === 0) {
        return NextResponse.json({ processed: 0, errored: 0, drained: true });
    }

    let processed = 0;
    let errored = 0;
    const deps = buildHandlerDeps();

    for (const raw of queue.documents) {
        const doc = raw as unknown as StripeEventDoc;
        try {
            const event = JSON.parse(doc.payload) as Stripe.Event;
            const handler = EVENT_HANDLERS[event.type];
            if (handler) await handler(deps, event);
            await databases.updateDocument(DB_ID, 'stripe_events', doc.$id, {
                processed: true,
                processedAt: new Date().toISOString(),
            });
            processed++;
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            console.error(
                '[cron/process-stripe-events] event',
                doc.eventId,
                'type=' + doc.type,
                'failed:',
                msg,
            );
            try {
                await databases.updateDocument(DB_ID, 'stripe_events', doc.$id, {
                    processed: true,
                    processedAt: new Date().toISOString(),
                    error: msg.slice(0, 2000),
                });
            } catch (markErr: any) {
                console.error(
                    '[cron/process-stripe-events] could not mark errored:',
                    markErr?.message ?? markErr,
                );
            }
            errored++;
        }
    }

    return NextResponse.json({
        processed,
        errored,
        drained: queue.documents.length < BATCH,
    });
}

export async function GET(request: Request) {
    return handle(request);
}

export async function POST(request: Request) {
    return handle(request);
}
