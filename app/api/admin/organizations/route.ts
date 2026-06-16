import { NextResponse } from 'next/server';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Teams as ServerTeams,
    ID,
} from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';
import { generateSignupCode } from '@/lib/auth/org';

/**
 * POST /api/admin/organizations
 *
 * Create a new organization in two steps:
 *   1. Create the backing Appwrite Team (so memberships work).
 *   2. Create the organizations row pointing at that team id.
 *
 * If step 2 fails after step 1 succeeded, we delete the dangling
 * team to keep state consistent.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

const REQUIRED = ['name', 'country', 'program_name'] as const;

export async function POST(request: Request) {
    let adminCtx: Awaited<ReturnType<typeof requireAdmin>>;
    try {
        adminCtx = await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!API_KEY) {
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });
    }
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    for (const k of REQUIRED) {
        if (typeof body[k] !== 'string' || (body[k] as string).trim() === '') {
            return NextResponse.json({ error: `${k} is required` }, { status: 400 });
        }
    }

    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    const databases = new ServerDatabases(client);
    const teams = new ServerTeams(client);

    let teamId: string | null = null;
    try {
        const team = await teams.create(ID.unique(), String(body.name).trim());
        teamId = team.$id;

        const programName = String(body.program_name).trim().toUpperCase();
        const signupCode = generateSignupCode(programName);

        const row = {
            appwriteTeamId: teamId,
            name: String(body.name).trim(),
            country: String(body.country).trim().toUpperCase(),
            program_name: programName,
            signup_code: signupCode,
            tier_override: body.tier_override ? String(body.tier_override) : null,
            commitment_months:
                typeof body.commitment_months === 'number' ? body.commitment_months : null,
            max_seats: typeof body.max_seats === 'number' ? body.max_seats : 0,
            signup_count: 0,
            expires_at: body.expires_at ? String(body.expires_at) : null,
            is_active: true,
            primary_contact_name: body.primary_contact_name
                ? String(body.primary_contact_name)
                : null,
            primary_contact_email: body.primary_contact_email
                ? String(body.primary_contact_email)
                : null,
            billing_contact_email: body.billing_contact_email
                ? String(body.billing_contact_email)
                : null,
            notes: body.notes ? String(body.notes) : null,
            createdBy: adminCtx.userId,
        };
        const created = await databases.createDocument(DB_ID, 'organizations', ID.unique(), row);
        return NextResponse.json({ orgId: created.$id, signupCode });
    } catch (err: any) {
        // Rollback the team if it landed but the row didn't.
        if (teamId) {
            try {
                await teams.delete(teamId);
            } catch (rollbackErr: any) {
                console.error(
                    '[admin/orgs] rollback team delete failed:',
                    rollbackErr?.message ?? rollbackErr,
                );
            }
        }
        return NextResponse.json({ error: err?.message ?? 'Create failed' }, { status: 500 });
    }
}
