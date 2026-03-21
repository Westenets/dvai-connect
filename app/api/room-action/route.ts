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
                canUpdateMetadata: true,
                canManageAgentSession: true,
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
        } else if (action === 'endRoom') {
            // Before deleting the room, stop any active recordings
            try {
                const egressClient = new (await import('livekit-server-sdk')).EgressClient(
                    LIVEKIT_URL,
                    API_KEY,
                    API_SECRET
                );
                
                // Collect all active egress IDs for this room
                const activeEgressIds = new Set<string>();

                // 1. Check LiveKit API
                const allEgresses = await egressClient.listEgress();
                allEgresses.forEach((info: any) => {
                    if (info.status >= 2) return;
                    if (info.roomName === roomName) {
                        activeEgressIds.add(info.egressId);
                    } else if (info.web && info.web.url.includes(`/rooms/${roomName}`)) {
                        // For WebEgress (used in E2EE)
                        activeEgressIds.add(info.egressId);
                    }
                });

                // 2. Check Appwrite DB for active recordings
                const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
                const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
                const APPWRITE_PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
                
                let dbDocsToUpdate: string[] = [];
                if (APPWRITE_API_KEY && APPWRITE_PROJECT && APPWRITE_ENDPOINT) {
                    try {
                        const { Client: AppwriteClient, Databases: AppwriteDatabases, Query } = await import('node-appwrite');
                        const appwriteClient = new AppwriteClient()
                            .setEndpoint(APPWRITE_ENDPOINT)
                            .setProject(APPWRITE_PROJECT)
                            .setKey(APPWRITE_API_KEY);
                        const appwriteDatabases = new AppwriteDatabases(appwriteClient);

                        const activeDocs = await appwriteDatabases.listDocuments(
                            'dvai-connect',
                            'recordings',
                            [
                                Query.equal('room_name', roomName),
                                Query.equal('status', 'recording')
                            ]
                        );

                        for (const doc of activeDocs.documents) {
                            activeEgressIds.add(doc.egress_id);
                            dbDocsToUpdate.push(doc.$id);
                        }

                        // Stop all collected egresses
                        if (activeEgressIds.size > 0) {
                            console.log(`Stopping ${activeEgressIds.size} active recordings for room ${roomName}:`, Array.from(activeEgressIds));
                            
                            // Use individual try-catch to ensure one failed stop doesn't block others or room deletion
                            await Promise.all(Array.from(activeEgressIds).map(async (id) => {
                                try {
                                    console.log(`Sending stop signal to egress: ${id}`);
                                    await egressClient.stopEgress(id);
                                } catch (e) {
                                    console.warn(`Note: Egress ${id} could not be stopped (it might have already finished):`, e);
                                }
                            }));

                            // Update DB status to processing for those we found in DB
                            for (const docId of dbDocsToUpdate) {
                                try {
                                    await appwriteDatabases.updateDocument('dvai-connect', 'recordings', docId, {
                                        status: 'processing'
                                    });
                                } catch (e) {
                                    console.error(`Failed to update DB doc ${docId}:`, e);
                                }
                            }
                        }
                    } catch (dbError) {
                        console.error('Failed to process recording cleanup in DB:', dbError);
                    }
                } else if (activeEgressIds.size > 0) {
                    // Fallback: stop egresses even if DB is not configured
                    console.log(`Stopping ${activeEgressIds.size} active recordings (no DB update) for room ${roomName}`);
                    await Promise.all(Array.from(activeEgressIds).map(id => egressClient.stopEgress(id)));
                }
            } catch (egressError) {
                console.error('Failed to stop recordings before room deletion:', egressError);
            }

            // Give egress service a tiny moment to initiate shutdown before room vanishes
            await new Promise(resolve => setTimeout(resolve, 1000));

            await roomService.deleteRoom(roomName);
            return new NextResponse('Room ended', { status: 200 });
        } else {
            return new NextResponse('Invalid action', { status: 400 });
        }
    } catch (error) {
        console.error('Room action failed:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}
