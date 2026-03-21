import { AccessToken, EgressClient, EncodedFileOutput, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const roomName = req.nextUrl.searchParams.get('roomName');
        const e2eePassphrase = req.nextUrl.searchParams.get('e2eePassphrase');

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

        const filename = `/out/${new Date(Date.now()).toISOString().replace(/:/g, '-')}-${roomName}.mp4`;
        console.log('Target filename:', filename);

        const fileOutput = new EncodedFileOutput({
            filepath: filename,
        });

        let egressInfo;
        if (e2eePassphrase) {
            const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
                identity: `recorder_${roomName}_${Date.now()}`,
                name: 'Recorder',
            });
            at.addGrant({
                room: roomName,
                roomJoin: true,
                canPublish: false,
                canSubscribe: true,
            });
            const token = await at.toJwt();

            const appUrl = new URL(`/rooms/${roomName}`, req.nextUrl.origin);
            appUrl.searchParams.append('recording', 'true');
            appUrl.searchParams.append('token', token);
            appUrl.searchParams.append('serverUrl', LIVEKIT_URL!);
            // We use the hash to pass the passphrase so it's not sent to the server (even though this is our server)
            appUrl.hash = e2eePassphrase;

            const webUrl = appUrl.toString();
            console.log('Starting Web Egress with URL:', webUrl);

            egressInfo = await egressClient.startWebEgress(webUrl, {
                file: fileOutput,
            });
        } else {
            egressInfo = await egressClient.startRoomCompositeEgress(
                roomName,
                {
                    file: fileOutput,
                },
                {
                    layout: 'speaker',
                },
            );
        }

        console.log('Egress started successfully:', egressInfo.egressId);

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Error starting egress:', error);
        if (error instanceof Error) {
            return new NextResponse(error.message, { status: 500 });
        }
    }
}
