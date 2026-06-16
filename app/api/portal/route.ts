import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { getCurrentUser } from '@/lib/auth/session';
import { createPortalSession } from '@/lib/actions/stripe';

/**
 * POST /api/portal
 *
 * Creates a Stripe Customer Portal session for the current user and
 * returns the hosted URL. Caller redirects the browser to that URL.
 *
 * Body: (optional) { returnUrl?: string }
 * Response: { url }
 *
 * Africa cohort customers get a portal configuration with subscription
 * cancellation + plan changes DISABLED (24-month commit). We detect
 * this by reading the user's current subscription row.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

async function isUserOnAfricaCohort(userId: string): Promise<boolean> {
    if (!API_KEY) return false;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'subscriptions', [
            Query.equal('userId', userId),
            Query.equal('isAfricaCohort', true),
            Query.limit(1),
        ]);
        return res.documents.length > 0;
    } catch (err: any) {
        console.warn('[api/portal] isUserOnAfricaCohort check failed:', err?.message ?? err);
        return false;
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const isAfrica = await isUserOnAfricaCohort(user.$id);
    try {
        const { url } = await createPortalSession({
            userId: user.$id,
            isAfricaCohort: isAfrica,
            returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
        });
        return NextResponse.json({ url });
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('[api/portal] failed:', msg);
        return NextResponse.json(
            { error: msg.includes('has not subscribed yet') ? 'Subscribe first.' : msg },
            { status: 400 },
        );
    }
}
