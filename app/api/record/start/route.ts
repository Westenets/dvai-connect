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

        const allEgresses = await egressClient.listEgress();
        const activeEgresses = allEgresses.filter((e: any) => e.status < 2);

        const isAlreadyRecording = activeEgresses.some((e: any) => {
            if (e.roomName === roomName) return true;
            if (e.web && e.web.url.includes(`/rooms/${roomName}`)) return true;
            return false;
        });

        if (isAlreadyRecording) {
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
            const startedBy = req.nextUrl.searchParams.get('startedBy') || 'unknown';

            const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
                identity: `recorder_${roomName}_${Date.now()}`,
                name: 'Recorder',
                metadata: JSON.stringify({ startedBy }),
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

        // --- Save to Appwrite DB immediately to track active recording ---
        try {
            const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
            const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
            const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;

            if (APPWRITE_API_KEY && project && endpoint) {
                const {
                    Client: AppwriteClient,
                    Databases: AppwriteDatabases,
                    ID: AppwriteID,
                } = await import('node-appwrite');
                const appwriteClient = new AppwriteClient()
                    .setEndpoint(endpoint)
                    .setProject(project)
                    .setKey(APPWRITE_API_KEY);
                const appwriteDatabases = new AppwriteDatabases(appwriteClient);

                // Get participant userIds and startedBy for initial tracking
                const { RoomServiceClient } = await import('livekit-server-sdk');
                const roomServiceClient = new RoomServiceClient(
                    hostURL.origin,
                    LIVEKIT_API_KEY,
                    LIVEKIT_API_SECRET,
                );
                const participants = await roomServiceClient.listParticipants(roomName);
                
                const participantUserIds = participants
                    .map((p) => {
                        if (!p.metadata) return null;
                        try {
                            const meta = JSON.parse(p.metadata);
                            return meta.userId || null;
                        } catch {
                            return null;
                        }
                    })
                    .filter((id): id is string => !!id);

                const startedBy = req.nextUrl.searchParams.get('startedBy') || 'unknown';

                await appwriteDatabases.createDocument(
                    'dvai-connect',
                    'recordings',
                    AppwriteID.unique(),
                    {
                        room_name: roomName,
                        egress_id: egressInfo.egressId,
                        file_name: filename.split('/').pop(),
                        status: 'recording',
                        started_by: startedBy,
                        participant_ids: participantUserIds,
                    },
                );
                console.log('Active recording tracked in Appwrite DB');
            }
        } catch (dbError) {
            console.error('Failed to track active recording in Appwrite DB:', dbError);
        }

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Error starting egress:', error);
        if (error instanceof Error) {
            return new NextResponse(error.message, { status: 500 });
        }
    }
}
