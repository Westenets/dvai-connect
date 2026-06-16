import { NextResponse } from 'next/server';
import { Client as ServerClient, Databases as ServerDatabases } from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * DELETE /api/admin/recordings/[id]
 *
 * Removes the recordings row. The file in storage (S3/Hetzner/R2) is
 * NOT deleted by this action — handled by a separate retention
 * lifecycle worker. This keeps the admin UI snappy and the destructive
 * side effects audit-traceable.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
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
        await databases.deleteDocument(DB_ID, 'recordings', id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'Delete failed' }, { status: 500 });
    }
}
