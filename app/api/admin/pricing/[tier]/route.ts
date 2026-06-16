import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases, Query, ID } from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';
import { __resetPricingOverridesCache } from '@/lib/pricing/overrides';
import type { TierId } from '@/lib/pricing/tiers';

/**
 * POST /api/admin/pricing/[tier]
 *
 * Upsert the display-copy override for a tier. Body shape:
 *   {
 *     displayName?: string,
 *     badge?: string,
 *     description?: string,
 *     headlineCopy?: string,
 *     bullets?: string[],
 *   }
 * Empty / missing fields clear the override (revert to tiers.ts default).
 *
 * DELETE /api/admin/pricing/[tier] removes the override row entirely.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

const ALLOWED_TIERS: ReadonlySet<TierId> = new Set<TierId>([
    'free',
    'pro_africa',
    'pro',
    'business',
    'enterprise',
]);

function buildDatabases(): ServerDatabases | null {
    if (!API_KEY) return null;
    return new ServerDatabases(
        new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY),
    );
}

export async function POST(request: Request, context: { params: Promise<{ tier: string }> }) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { tier: rawTier } = await context.params;
    const tier = rawTier as TierId;
    if (!ALLOWED_TIERS.has(tier)) {
        return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });
    }
    const databases = buildDatabases();
    if (!databases)
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const fields: Record<string, unknown> = { tier };
    if (typeof body.displayName === 'string') fields.displayName = body.displayName.trim() || null;
    if (typeof body.badge === 'string') fields.badge = body.badge.trim() || null;
    if (typeof body.description === 'string') fields.description = body.description.trim() || null;
    if (typeof body.headlineCopy === 'string')
        fields.headlineCopy = body.headlineCopy.trim() || null;
    if (Array.isArray(body.bullets)) {
        const arr = (body.bullets as unknown[]).filter(
            (s): s is string => typeof s === 'string' && s.trim() !== '',
        );
        fields.bulletJson = arr.length > 0 ? JSON.stringify(arr) : null;
    }

    try {
        const existing = await databases.listDocuments(DB_ID, 'pricing_tiers', [
            Query.equal('tier', tier),
            Query.limit(1),
        ]);
        if (existing.documents[0]) {
            await databases.updateDocument(
                DB_ID,
                'pricing_tiers',
                existing.documents[0].$id,
                fields,
            );
        } else {
            await databases.createDocument(DB_ID, 'pricing_tiers', ID.unique(), fields);
        }
        __resetPricingOverridesCache();
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) {
            return NextResponse.json(
                {
                    error: 'pricing_tiers collection not migrated. Run scripts/appwrite-migrate-pricing-tiers-2026-06-14.mjs.',
                },
                { status: 500 },
            );
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tier: string }> }) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { tier: rawTier } = await context.params;
    const tier = rawTier as TierId;
    if (!ALLOWED_TIERS.has(tier)) {
        return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });
    }
    const databases = buildDatabases();
    if (!databases)
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });
    try {
        const existing = await databases.listDocuments(DB_ID, 'pricing_tiers', [
            Query.equal('tier', tier),
            Query.limit(1),
        ]);
        if (existing.documents[0]) {
            await databases.deleteDocument(DB_ID, 'pricing_tiers', existing.documents[0].$id);
        }
        __resetPricingOverridesCache();
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Delete failed' }, { status: 500 });
    }
}
