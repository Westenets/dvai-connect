import { EgressClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const roomName = req.nextUrl.searchParams.get('roomName');

        /**
         * CAUTION:
         * for simplicity this implementation does not authenticate users and therefore allows anyone with knowledge of a roomName
         * to start/stop recordings for that room.
         * DO NOT USE THIS FOR PRODUCTION PURPOSES AS IS
         */

        if (roomName === null) {
            return new NextResponse('Missing roomName parameter', { status: 403 });
        }

        const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

        const hostURL = new URL(LIVEKIT_URL!);
        if (hostURL.protocol === 'ws:') hostURL.protocol = 'http:';
        if (hostURL.protocol === 'wss:') hostURL.protocol = 'https:';

        const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        const activeEgresses = (await egressClient.listEgress({ roomName })).filter(
            (info) => info.status < 2,
        );
        if (activeEgresses.length === 0) {
            return new NextResponse('No active recording found', { status: 404 });
        }
        console.log('Stopping egress for room:', roomName);
        const stopPromises = activeEgresses.map((info) => {
            console.log('Stopping egress ID:', info.egressId);
            return egressClient.stopEgress(info.egressId);
        });
        await Promise.all(stopPromises);

        console.log('All active egresses stop request sent');

        // Construct the public URLs
        const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_MEET_BUCKET_ID || 'mvc-files';
        const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
        const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

        const urls = activeEgresses.map((info) => {
            const fileName = info.fileResults?.[0]?.filename?.split('/').pop() || info.egressId;
            const fileExtension = fileName.split('.').pop();
            // Appwrite fileId allows alphanumeric, underscore, and hyphen. Periods are NOT supported.
            const fileId = fileName
                .replace(`.${fileExtension}`, '')
                .replace(/[^a-zA-Z0-9_-]/g, '_');
            return `${endpoint}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${project}`;
        });

        return NextResponse.json({ urls }, { status: 200 });
    } catch (error) {
        console.error('Error stopping egress:', error);
        if (error instanceof Error) {
            return new NextResponse(error.message, { status: 500 });
        }
    }
}
