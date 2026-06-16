import { NextResponse } from 'next/server';
import {
    Client as ServerClient,
    Teams as ServerTeams,
    Databases as ServerDatabases,
    ID,
} from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * POST /api/admin/organizations/[id]/invite
 *
 * Invites a member into the org's backing Appwrite Team. The user
 * receives an Appwrite-templated email with a confirmation URL.
 *
 * Body: { email, roles?: 'member' | 'admin' | 'owner', name? }
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://connect.deepvoiceai.co';

const ALLOWED_ROLES = new Set(['member', 'admin', 'owner']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!API_KEY) {
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });
    }
    const { id } = await context.params;
    let body: { email?: string; roles?: string; name?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const email = body.email?.trim();
    const role = (body.roles ?? 'member').toLowerCase();
    const name = body.name?.trim() || undefined;
    if (!email) {
        return NextResponse.json({ error: 'email required' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
        return NextResponse.json(
            { error: `role must be one of: ${[...ALLOWED_ROLES].join(', ')}` },
            { status: 400 },
        );
    }
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const teams = new ServerTeams(client);
        const orgDoc = (await databases.getDocument(DB_ID, 'organizations', id)) as unknown as {
            appwriteTeamId: string;
        };
        const teamId = orgDoc.appwriteTeamId;
        const membership = await teams.createMembership(
            teamId,
            [role],
            email,
            undefined, // userId — null means look up or create
            undefined, // phone
            `${APP_BASE_URL}/login`,
            name,
        );
        return NextResponse.json({
            ok: true,
            membershipId: membership.$id,
            confirmed: membership.confirm,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Invite failed' }, { status: 500 });
    }
}
