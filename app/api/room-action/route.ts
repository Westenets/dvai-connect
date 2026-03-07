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
        } else if (action === 'deny' || action === 'remove') {
            await roomService.removeParticipant(roomName, identity);
            return new NextResponse('Participant removed', { status: 200 });
        } else if (action === 'mute' || action === 'unmute') {
            const p = await roomService.getParticipant(roomName, identity);
            const audioTrack = p.tracks.find((t) => t.type === 0); // Audio track type
            if (!audioTrack) {
                return new NextResponse('No audio track found', { status: 404 });
            }

            if (action === 'mute') {
                await roomService.mutePublishedTrack(roomName, identity, audioTrack.sid, true);
                return new NextResponse('Muted', { status: 200 });
            } else {
                // 'unmute' - send data message to request local unmute
                const encoder = new TextEncoder();
                const payload = JSON.stringify({ type: 'request-unmute' });
                await roomService.sendData(roomName, encoder.encode(payload), 0, {
                    destinationIdentities: [identity],
                });
                return new NextResponse('Unmute requested', { status: 200 });
            }
        } else if (action === 'togglePin') {
            const p = await roomService.getParticipant(roomName, identity);
            const attributes = p.attributes || {};
            const isPinned = attributes.pinned === 'true';

            await roomService.updateParticipant(roomName, identity, {
                metadata: p.metadata,
                permission: p.permission,
                attributes: {
                    ...attributes,
                    pinned: isPinned ? 'false' : 'true',
                },
            });
            return new NextResponse(isPinned ? 'Unpinned' : 'Pinned', { status: 200 });
        } else {
            return new NextResponse('Invalid action', { status: 400 });
        }
    } catch (error) {
        console.error('Room action failed:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}
