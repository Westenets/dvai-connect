import { AccessToken, EgressClient, EncodedFileOutput, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPlan } from '@/lib/auth/subscription';
import { TIERS } from '@/lib/pricing/tiers';

/**
 * Feature flag: when 'true', /api/record/start requires an authenticated
 * user AND requires their tier to include cloud recording.
 *
 * Default 'false' (off) — preserves the existing flow until the full
 * payment system lands (Tasks 1 PR 3b through 3e). Flip on once Stripe +
 * Appwrite subscriptions + the real isPaidUser are wired up.
 *
 * Sidelined for user action.
 */
const PAID_GATES_ENABLED = process.env.PAID_FEATURE_GATES_ENABLED === 'true';

export async function GET(req: NextRequest) {
    try {
        const roomName = req.nextUrl.searchParams.get('roomName');
        const e2eePassphrase = req.nextUrl.searchParams.get('e2eePassphrase');

        /**
         * Authentication note (2026-06-13): an authentication + tier-aware
         * paywall is now in place behind PAID_FEATURE_GATES_ENABLED. When
         * the flag is on, this route requires an authenticated user whose
         * tier allows recording. Previously this route was intentionally
         * unauthenticated for development convenience — see the original
         * CAUTION comment in git history.
         */

        if (PAID_GATES_ENABLED) {
            const user = await getCurrentUser();
            if (!user) {
                return new NextResponse('Unauthorized', { status: 401 });
            }
            // Tier comes from the Appwrite subscriptions collection
            // populated by the Stripe webhook event processor.
            const tier = await getUserPlan(user.$id);
            if (!TIERS[tier].cloudRecording) {
                return new NextResponse('Recording requires Pro or higher.', { status: 402 });
            }
        }

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
                    Query: AppwriteQuery,
                } = await import('node-appwrite');
                const appwriteClient = new AppwriteClient()
                    .setEndpoint(endpoint)
                    .setProject(project)
                    .setKey(APPWRITE_API_KEY);
                const appwriteDatabases = new AppwriteDatabases(appwriteClient);

                // Get Room Admins
                const roomAdmins = await appwriteDatabases.listDocuments(
                    'dvai-connect',
                    'room_admins',
                    [AppwriteQuery.equal('roomId', roomName)]
                );
                const adminIds = roomAdmins.documents.map(doc => doc.adminId);

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
                            return meta.userId || meta.userName || null;
                        } catch {
                            return null;
                        }
                    })
                    .filter((id): id is string => !!id);

                const startedBy = req.nextUrl.searchParams.get('startedBy') || 'unknown';
                const initiator = participants.find(p => p.identity === startedBy);
                let initiatorId = null;
                if (initiator?.metadata) {
                    try {
                        const meta = JSON.parse(initiator.metadata);
                        initiatorId = meta.userId;
                    } catch (e) {}
                }

                // Combine admins and initiator for the owner array
                const owners = Array.from(new Set([...adminIds, initiatorId].filter(id => !!id)));

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
                        owner: owners,
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
