import { NextResponse } from 'next/server';
import { buildHandlerDeps } from '@/lib/stripe-events/handlers';
import { drainPendingEvents } from '@/lib/stripe-events/drain';

/**
 * GET/POST /api/cron/process-stripe-events
 *
 * Drains unprocessed events from stripe_events and applies the state
 * mutation to the subscriptions collection via lib/stripe-events/handlers.
 *
 * Auth: CRON_SECRET via Authorization: Bearer header. workers/cron.mjs
 * is the in-process scheduler that pings this route every minute.
 * External cron services (cron-job.org etc.) must include the same
 * header. We support both GET and POST so `curl -H` and vercel.json
 * cron configs both work.
 *
 * Behavior:
 *   - Pulls up to 50 unprocessed events per invocation (oldest first).
 *   - Each event is dispatched via EVENT_HANDLERS, then marked
 *     processed=true with processedAt. On handler failure, the row is
 *     STILL marked processed=true and the `error` field captures the
 *     message so we don't loop on a poison event — manual ops can
 *     inspect + reprocess after fix.
 *   - Returns { processed, errored, drained }.
 *
 * Run cadence: every 1 minute. The /api/checkout/verify route inline-
 * drains its own session's events on miss, so the cron is the safety
 * net for stuck/orphaned events rather than the primary path.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BATCH = 50;

function authorized(request: Request): boolean {
    if (!CRON_SECRET) {
        return process.env.CRON_SECRET_DEV_BYPASS === '1';
    }
    const header = request.headers.get('authorization') ?? '';
    return header === `Bearer ${CRON_SECRET}`;
}

async function handle(request: Request) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let deps;
    try {
        deps = buildHandlerDeps();
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message ?? 'Handler deps unavailable' },
            { status: 500 },
        );
    }
    const result = await drainPendingEvents(deps, BATCH);
    return NextResponse.json(result);
}

export async function GET(request: Request) {
    return handle(request);
}

export async function POST(request: Request) {
    return handle(request);
}
