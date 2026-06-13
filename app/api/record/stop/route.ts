import { EgressClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * Feature flag: when 'true', /api/record/stop requires an authenticated
 * user. Stopping a recording you didn't start is gated by simple auth
 * presence here; org-level "you must be a member of the room creator's
 * org" is enforced at the admin panel level once the org primitive is
 * wired up (PR 3a-2 + 3e).
 *
 * Default 'false' (off). See app/api/record/start/route.ts for the rationale.
 */
const PAID_GATES_ENABLED = process.env.PAID_FEATURE_GATES_ENABLED === 'true';

export async function GET(req: NextRequest) {
    try {
        const roomName = req.nextUrl.searchParams.get('roomName');

        if (PAID_GATES_ENABLED) {
            const user = await getCurrentUser();
            if (!user) {
                return new NextResponse('Unauthorized', { status: 401 });
            }
        }

        if (roomName === null) {
            return new NextResponse('Missing roomName parameter', { status: 403 });
        }

        const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

        const hostURL = new URL(LIVEKIT_URL!);
        hostURL.protocol = 'https:';

        const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        // 1. Get egresses from LiveKit API (standard RoomComposite)
        const allEgresses = await egressClient.listEgress();
        const activeEgressesFromLiveKit = allEgresses.filter((info: any) => {
            if (info.status >= 2) return false;
            if (info.roomName === roomName) return true;
            if (info.web && info.web.url.includes(`/rooms/${roomName}`)) return true;
            return false;
        });

        // 2. Get egresses from Appwrite DB (reliable fallback for WebEgress/E2EE)
        const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
        const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
        const APPWRITE_PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

        let activeEgressIds = new Set(activeEgressesFromLiveKit.map((e) => e.egressId));
        let dbDocsToUpdate: any[] = [];

        if (APPWRITE_API_KEY && APPWRITE_PROJECT && APPWRITE_ENDPOINT) {
            const {
                Client: AppwriteClient,
                Databases: AppwriteDatabases,
                Query,
            } = await import('node-appwrite');
            const appwriteClient = new AppwriteClient()
                .setEndpoint(APPWRITE_ENDPOINT)
                .setProject(APPWRITE_PROJECT)
                .setKey(APPWRITE_API_KEY);
            const appwriteDatabases = new AppwriteDatabases(appwriteClient);

            const activeDocs = await appwriteDatabases.listDocuments('dvai-connect', 'recordings', [
                Query.equal('room_name', roomName),
                Query.equal('status', 'recording'),
            ]);

            for (const doc of activeDocs.documents) {
                activeEgressIds.add(doc.egress_id);
                dbDocsToUpdate.push({ id: doc.$id, egressId: doc.egress_id });
            }
        }

        if (activeEgressIds.size === 0) {
            return new NextResponse(`No active recording found for room ${roomName}`, {
                status: 404,
            });
        }

        console.log('Stopping egresses:', Array.from(activeEgressIds));
        const stopPromises = Array.from(activeEgressIds).map((id) => {
            console.log('Stopping egress ID:', id);
            return egressClient.stopEgress(id);
        });
        const stopResults = await Promise.all(stopPromises);

        // Update DB status to processing
        if (dbDocsToUpdate.length > 0) {
            const { Client: AppwriteClient, Databases: AppwriteDatabases } =
                await import('node-appwrite');
            const appwriteClient = new AppwriteClient()
                .setEndpoint(APPWRITE_ENDPOINT!)
                .setProject(APPWRITE_PROJECT!)
                .setKey(APPWRITE_API_KEY!);
            const appwriteDatabases = new AppwriteDatabases(appwriteClient);

            for (const doc of dbDocsToUpdate) {
                try {
                    await appwriteDatabases.updateDocument('dvai-connect', 'recordings', doc.id, {
                        status: 'processing',
                    });
                } catch (e) {
                    console.error(`Failed to update doc ${doc.id} to processing:`, e);
                }
            }
        }

        console.log('All active egresses stop request sent');

        // Construct the public URLs
        const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_MEET_BUCKET_ID || 'mvc-files';
        const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
        const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

        const urls = stopResults.map((info: any) => {
            const fileName = info.fileResults?.[0]?.filename?.split('/').pop() || info.egressId;
            const fileExtension = fileName.split('.').pop();
            // Appwrite fileId allows alphanumeric, underscore, and hyphen. Periods are NOT supported.
            // Truncate to 36 chars to match Appwrite limits and egress-watcher
            const fileId = fileName
                .replace(`.${fileExtension}`, '')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .substring(0, 36);
            return `${endpoint}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${project}`;
        });

        // Redundant createDocument logic removed because it's now handled in start/route.ts
        // and finalized in the egress-watcher worker.

        return NextResponse.json({
            message: 'Recording stopped',
            urls,
        });
    } catch (error) {
        console.error('Error stopping egress:', error);
        if (error instanceof Error) {
            return new NextResponse(error.message, { status: 500 });
        }
    }
}
