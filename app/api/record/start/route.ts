import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';
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

        const {
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
            LIVEKIT_URL,
        } = process.env;

        const hostURL = new URL(LIVEKIT_URL!);
        hostURL.protocol = 'https:';

        const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        const existingEgresses = await egressClient.listEgress({ roomName });
        if (existingEgresses.length > 0 && existingEgresses.some((e) => e.status < 2)) {
            return new NextResponse('Meeting is already being recorded', { status: 409 });
        }

        console.log('Starting egress for room:', roomName);

        const filename = `/out/meet-${new Date(Date.now()).toISOString().replace(/:/g, '-')}-${roomName}.mp4`;
        console.log('Target filename:', filename);

        const fileOutput = new EncodedFileOutput({
            filepath: filename,
        });

        const egressInfo = await egressClient.startRoomCompositeEgress(
            roomName,
            {
                file: fileOutput,
            },
            {
                layout: 'speaker',
            },
        );

        console.log('Egress started successfully:', egressInfo.egressId);

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Error starting egress:', error);
        if (error instanceof Error) {
            return new NextResponse(error.message, { status: 500 });
        }
    }
}
