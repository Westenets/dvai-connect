import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * POST /api/admin/rooms/[name]/end
 *
 * Terminates the LiveKit room for everyone. Admin-only (requireAdmin
 * runs the Layer 2 gate; the actual end-meeting authority is
 * platform-admin OR org admin for the room's owning org — for v1 we
 * gate on any admin).
 */

export const dynamic = 'force-dynamic';

export async function POST(
    _request: Request,
    context: { params: Promise<{ name: string }> },
) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { name: rawName } = await context.params;
    const roomName = decodeURIComponent(rawName);
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
        return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 });
    }
    try {
        const svc = new RoomServiceClient(url, apiKey, apiSecret);
        await svc.deleteRoom(roomName);
        return NextResponse.json({ ok: true, roomName });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message ?? 'Failed to delete room' },
            { status: 500 },
        );
    }
}
