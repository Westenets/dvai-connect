import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * GET /api/billing/status
 *
 * Returns the current user's subscription summary, joined to enough
 * fields for the /billing page to render the "You're on X · next bill
 * Y" line and the Manage / Subscribe CTAs.
 *
 *   {
 *     authenticated: true,
 *     tier: 'free' | 'pro_africa' | 'pro' | 'business' | 'enterprise',
 *     subscription: {
 *       status, currentPeriodEnd, cancelAtPeriodEnd, isAfricaCohort,
 *       africaCommitmentEnd?, stripeCustomerId
 *     } | null
 *   }
 *
 * subscription is null for free users (no Stripe customer yet).
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    if (!API_KEY) {
        return NextResponse.json({
            authenticated: true,
            tier: 'free',
            subscription: null,
            warning: 'APPWRITE_API_KEY missing — billing data unavailable',
        });
    }
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'subscriptions', [
            Query.equal('userId', user.$id),
            Query.orderDesc('$updatedAt'),
            Query.limit(1),
        ]);
        const doc = res.documents[0] as unknown as
            | undefined
            | {
                tier: string;
                status: string;
                currentPeriodEnd: string;
                cancelAtPeriodEnd?: boolean;
                isAfricaCohort?: boolean;
                africaCommitmentEnd?: string;
                stripeCustomerId: string;
            };
        if (!doc) {
            return NextResponse.json({
                authenticated: true,
                tier: 'free',
                subscription: null,
            });
        }
        return NextResponse.json({
            authenticated: true,
            tier: doc.tier,
            subscription: {
                status: doc.status,
                currentPeriodEnd: doc.currentPeriodEnd,
                cancelAtPeriodEnd: doc.cancelAtPeriodEnd ?? false,
                isAfricaCohort: doc.isAfricaCohort ?? false,
                africaCommitmentEnd: doc.africaCommitmentEnd ?? null,
                stripeCustomerId: doc.stripeCustomerId,
            },
        });
    } catch (err: any) {
        return NextResponse.json({
            authenticated: true,
            tier: 'free',
            subscription: null,
            warning: err?.message ?? 'Lookup failed',
        });
    }
}
