import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases } from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';
import { generateSignupCode, type Org } from '@/lib/auth/org';

/**
 * POST /api/admin/organizations/[id]/regenerate
 *
 * Generates a new signup code for the org and writes it back. The
 * previous code becomes invalid the moment this completes — any
 * in-flight /signup?code=... validations will return "invalid".
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!API_KEY) {
        return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });
    }
    const { id } = await context.params;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const doc = await databases.getDocument(DB_ID, 'organizations', id);
        const org = doc as unknown as Org;
        const newCode = generateSignupCode(org.program_name);
        await databases.updateDocument(DB_ID, 'organizations', id, {
            signup_code: newCode,
        });
        return NextResponse.json({ ok: true, signup_code: newCode });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Regenerate failed' }, { status: 500 });
    }
}
