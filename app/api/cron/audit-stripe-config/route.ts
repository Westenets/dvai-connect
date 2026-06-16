import { NextResponse } from 'next/server';
import { requireStripe } from '@/lib/stripe';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { AFRICA_COMMITMENT_MONTHS } from '@/lib/africa/commitment';

/**
 * GET/POST /api/cron/audit-stripe-config
 *
 * Daily Africa portal drift check. Verifies:
 *
 *   1. Every Africa-cohort subscription (subscriptions.isAfricaCohort
 *      == true) currently has a Stripe Subscription Schedule attached
 *      whose first phase locks for AFRICA_COMMITMENT_MONTHS. If a
 *      subscription has been mutated (schedule released early, phase
 *      shortened, customer un-locked) the cron emits a structured
 *      alert.
 *
 *   2. The Africa-cohort Customer Portal configuration (referenced by
 *      STRIPE_PORTAL_CONFIG_AFRICA) still has subscription_cancel and
 *      subscription_update disabled. If anyone toggles them back on
 *      via the Stripe Dashboard, alert.
 *
 * Output: { ok, driftFound, alerts: [...] }. Wire up a Vercel cron at
 * a daily cadence (e.g. 09:00 UTC) and pipe non-empty alerts to your
 * incident channel.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const AFRICA_PORTAL_CONFIG_ID = process.env.STRIPE_PORTAL_CONFIG_AFRICA ?? '';

interface SubscriptionDoc {
    $id: string;
    userId: string;
    stripeSubscriptionId: string;
    stripeScheduleId?: string;
    isAfricaCohort: boolean;
    africaCohortCode?: string;
    africaCommitmentEnd?: string;
}

interface Alert {
    type: 'schedule_missing' | 'schedule_released' | 'phase_shortened' | 'portal_config_unlocked';
    detail: string;
    subscriptionId?: string;
    userId?: string;
}

function authorized(request: Request): boolean {
    if (!CRON_SECRET) return process.env.CRON_SECRET_DEV_BYPASS === '1';
    return request.headers.get('authorization') === `Bearer ${CRON_SECRET}`;
}

async function handle(request: Request) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!API_KEY) {
        return NextResponse.json({ error: 'APPWRITE_API_KEY not configured' }, { status: 500 });
    }
    const stripe = requireStripe();
    const databases = new ServerDatabases(
        new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY),
    );

    const alerts: Alert[] = [];

    // --- 1. Audit Africa subscriptions ---
    let cursor: string | undefined;
    let auditedSubs = 0;
    /* eslint-disable no-constant-condition */
    while (true) {
        const queries = [Query.equal('isAfricaCohort', true), Query.limit(100)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const page = await databases
            .listDocuments(DB_ID, 'subscriptions', queries)
            .catch(() => null);
        if (!page || page.documents.length === 0) break;
        for (const raw of page.documents) {
            auditedSubs++;
            const doc = raw as unknown as SubscriptionDoc;
            try {
                const sub = await stripe.subscriptions.retrieve(doc.stripeSubscriptionId);
                const scheduleId =
                    typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;
                if (!scheduleId) {
                    alerts.push({
                        type: 'schedule_missing',
                        detail: `Africa subscription ${doc.stripeSubscriptionId} (user ${doc.userId}) has no Schedule attached — commitment lock is broken.`,
                        subscriptionId: doc.stripeSubscriptionId,
                        userId: doc.userId,
                    });
                    continue;
                }
                const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
                if (schedule.status === 'released' || schedule.status === 'canceled') {
                    alerts.push({
                        type: 'schedule_released',
                        detail: `Africa subscription ${doc.stripeSubscriptionId} schedule is ${schedule.status} — commitment lock no longer enforced.`,
                        subscriptionId: doc.stripeSubscriptionId,
                        userId: doc.userId,
                    });
                    continue;
                }
                // First phase should have a `duration` of >= AFRICA_COMMITMENT_MONTHS
                // months, OR a corresponding start/end span >= ~24 months.
                const firstPhase = schedule.phases[0];
                if (!firstPhase) {
                    alerts.push({
                        type: 'phase_shortened',
                        detail: `Africa subscription ${doc.stripeSubscriptionId} schedule has no phases.`,
                        subscriptionId: doc.stripeSubscriptionId,
                        userId: doc.userId,
                    });
                    continue;
                }
                const phaseMonths = phaseDurationMonths(firstPhase);
                if (phaseMonths < AFRICA_COMMITMENT_MONTHS) {
                    alerts.push({
                        type: 'phase_shortened',
                        detail: `Africa subscription ${doc.stripeSubscriptionId} first phase is ${phaseMonths.toFixed(1)} months, expected >= ${AFRICA_COMMITMENT_MONTHS}.`,
                        subscriptionId: doc.stripeSubscriptionId,
                        userId: doc.userId,
                    });
                }
            } catch (err: any) {
                console.warn(
                    '[cron/audit] failed to verify sub',
                    doc.stripeSubscriptionId,
                    ':',
                    err?.message ?? err,
                );
            }
        }
        cursor = page.documents[page.documents.length - 1].$id;
        if (page.documents.length < 100) break;
    }

    // --- 2. Audit Africa portal configuration ---
    if (AFRICA_PORTAL_CONFIG_ID) {
        try {
            const portal =
                await stripe.billingPortal.configurations.retrieve(AFRICA_PORTAL_CONFIG_ID);
            const cancelEnabled = portal.features?.subscription_cancel?.enabled;
            const updateEnabled = portal.features?.subscription_update?.enabled;
            if (cancelEnabled || updateEnabled) {
                alerts.push({
                    type: 'portal_config_unlocked',
                    detail: `Africa portal configuration ${AFRICA_PORTAL_CONFIG_ID} has subscription_cancel=${cancelEnabled} subscription_update=${updateEnabled} — both should be false.`,
                });
            }
        } catch (err: any) {
            console.warn('[cron/audit] portal config check failed:', err?.message ?? err);
        }
    } else {
        alerts.push({
            type: 'portal_config_unlocked',
            detail: 'STRIPE_PORTAL_CONFIG_AFRICA is not configured — Africa cohort customers will fall back to the default portal config and may see cancel/upgrade options.',
        });
    }

    return NextResponse.json({
        ok: alerts.length === 0,
        driftFound: alerts.length > 0,
        auditedSubscriptions: auditedSubs,
        alerts,
    });
}

function phaseDurationMonths(phase: { start_date: number; end_date: number }): number {
    const seconds = phase.end_date - phase.start_date;
    return seconds / (30 * 86400);
}

export async function GET(request: Request) {
    return handle(request);
}

export async function POST(request: Request) {
    return handle(request);
}
