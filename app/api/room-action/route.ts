import { RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function POST(request: NextRequest) {
    try {
        if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
            return new NextResponse('LiveKit credentials not configured', { status: 500 });
        }

        const body = await request.json();
        const { roomName, identity, action } = body;

        if (!roomName || !identity || !action) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const roomService = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);

        if (action === 'admit') {
            const p = await roomService.getParticipant(roomName, identity);
            let metadata = p.metadata ? JSON.parse(p.metadata) : {};
            if (metadata.status) {
                delete metadata.status;
            }

            await roomService.updateParticipant(roomName, identity, JSON.stringify(metadata), {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                hidden: false,
                recorder: false,
            });
            return new NextResponse('Admitted', { status: 200 });
        } else if (action === 'deny') {
            await roomService.removeParticipant(roomName, identity);
            return new NextResponse('Denied', { status: 200 });
        } else {
            return new NextResponse('Invalid action', { status: 400 });
        }
    } catch (error) {
        console.error('Room action failed:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}
