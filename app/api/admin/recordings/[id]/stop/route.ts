import { NextResponse } from 'next/server';
import { EgressClient } from 'livekit-server-sdk';
import { Client as ServerClient, Databases as ServerDatabases } from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * POST /api/admin/recordings/[id]/stop?roomName=...
 *
 * Force-stops an in-flight egress for the given room. Idempotent —
 * already-stopped egresses return ok without error.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await context.params;
    const url = new URL(request.url);
    const roomName = url.searchParams.get('roomName');
    if (!roomName) {
        return NextResponse.json({ error: 'roomName query param required' }, { status: 400 });
    }
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 });
    }
    const hostURL = new URL(LIVEKIT_URL);
    hostURL.protocol = 'https:';
    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    let stoppedCount = 0;
    try {
        const all = await egressClient.listEgress();
        const active = all.filter(
            (e: any) =>
                e.status < 2 &&
                (e.roomName === roomName || e.web?.url?.includes(`/rooms/${roomName}`)),
        );
        for (const e of active) {
            try {
                await egressClient.stopEgress(e.egressId);
                stoppedCount++;
            } catch (err: any) {
                console.warn('[admin/recordings/stop] stopEgress failed:', err?.message ?? err);
            }
        }
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? 'List egress failed' }, { status: 500 });
    }

    // Mark our recording row as completed so the UI updates.
    if (API_KEY) {
        try {
            const db = new ServerDatabases(
                new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY),
            );
            await db.updateDocument(DB_ID, 'recordings', id, { status: 'completed' });
        } catch {
            // not fatal — the egress is stopped either way.
        }
    }

    return NextResponse.json({ ok: true, stoppedCount });
}
