import { NextResponse } from 'next/server';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Query,
    ID,
} from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * POST /api/admin/organizations/[id]/branding
 *
 * Upsert the org_branding row for this organization. Body is a JSON
 * object with any subset of the branding fields; unset fields are
 * left as-is.
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
    const fields: Record<string, string> = {};
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
        if (existing.documents[0]) {
            await databases.updateDocument(DB_ID, 'org_branding', existing.documents[0].$id, fields);
            return NextResponse.json({ ok: true, updated: existing.documents[0].$id });
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
