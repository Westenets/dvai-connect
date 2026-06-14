import { NextResponse } from 'next/server';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Query,
    ID,
} from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';
import { generateVerificationToken } from '@/lib/branding/domain-verify';

/**
 * POST /api/admin/organizations/[id]/branding
 *
 * Upsert the org_branding row. Side effect: if the saved customDomain
 * changed (and the org didn't already have a verification token for
 * the new value), we mint a fresh token and reset the verification
 * status to 'pending'. If customDomain is cleared, all verification
 * fields reset.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

const ALLOWED_FIELDS = [
    'logoUrl',
    'darkLogoUrl',
    'primaryColor',
    'accentColor',
    'customDomain',
    'loginScreenCopy',
    'emailFromName',
    'emailFromAddress',
] as const;

interface BrandingRow {
    $id: string;
    customDomain?: string;
    customDomainVerificationToken?: string;
}

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!API_KEY) {
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });
    }
    const { id } = await context.params;
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const fields: Record<string, string | null> = {};
    for (const key of ALLOWED_FIELDS) {
        if (typeof body[key] === 'string') {
            fields[key] = (body[key] as string).trim();
        }
    }

    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const orgDoc = (await databases.getDocument(DB_ID, 'organizations', id)) as unknown as {
            appwriteTeamId: string;
        };
        const teamId = orgDoc.appwriteTeamId;
        const existing = await databases.listDocuments(DB_ID, 'org_branding', [
            Query.equal('appwriteTeamId', teamId),
            Query.limit(1),
        ]);
        const existingRow = existing.documents[0] as unknown as BrandingRow | undefined;

        // Verification token management.
        const newDomain = (fields.customDomain ?? '').trim();
        const oldDomain = (existingRow?.customDomain ?? '').trim();
        if (newDomain && newDomain !== oldDomain) {
            // Domain changed (or first set) — mint a new token and
            // reset verification state.
            fields.customDomainVerificationToken = generateVerificationToken();
            fields.customDomainVerificationStatus = 'pending';
            fields.customDomainVerifiedAt = null;
            fields.customDomainCheckedAt = null;
            fields.customDomainVerificationError = null;
        } else if (!newDomain && oldDomain) {
            // Domain cleared — wipe verification too.
            fields.customDomainVerificationToken = null;
            fields.customDomainVerificationStatus = null;
            fields.customDomainVerifiedAt = null;
            fields.customDomainCheckedAt = null;
            fields.customDomainVerificationError = null;
        } else if (newDomain === oldDomain && oldDomain && !existingRow?.customDomainVerificationToken) {
            // Domain unchanged but no token yet (e.g. row predates the
            // domain-verify migration) — backfill a token.
            fields.customDomainVerificationToken = generateVerificationToken();
            fields.customDomainVerificationStatus = 'pending';
        }

        if (existingRow) {
            await databases.updateDocument(DB_ID, 'org_branding', existingRow.$id, fields);
            return NextResponse.json({ ok: true, updated: existingRow.$id });
        }
        const created = await databases.createDocument(DB_ID, 'org_branding', ID.unique(), {
            appwriteTeamId: teamId,
            ...fields,
        });
        return NextResponse.json({ ok: true, created: created.$id });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message ?? 'Save failed' },
            { status: 500 },
        );
    }
}
