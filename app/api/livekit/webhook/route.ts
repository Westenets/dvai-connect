import { NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Query,
    ID,
} from 'node-appwrite';
import { requireStripe } from '@/lib/stripe';
import type { TierId } from '@/lib/pricing/tiers';

/**
 * POST /api/livekit/webhook
 *
 * LiveKit server-side webhook receiver. Verifies the bearer-style
 * signed Authorization header using the same API key/secret pair we
 * use to mint participant tokens, then dispatches per event type.
 *
 * Responsibilities:
 *   1. Mirror room state into the Appwrite `active_rooms` collection
 *      (consumed by the admin Rooms page).
 *   2. Fire Stripe Billing Meter Events when a customer crosses a
 *      metered threshold:
 *        - business_extra_hours — on room_finished, for Business
 *          customers whose meeting exceeded 60 minutes.
 *        - concurrent_big_room_session — on participant_joined, for
 *          Enterprise customers whose room hits the 1,000-attendee
 *          threshold. Fired ONCE per session via Stripe's idempotency
 *          identifier (`${roomSid}:big_room`).
 *   3. Stamp session_logs.leftAt on participant_left so admin sees
 *      complete session durations.
 *
 * Wire-up:
 *   LiveKit Console → project → Webhooks → add
 *   URL = https://connect.deepvoiceai.co/api/livekit/webhook
 *   The signing secret is your LiveKit API secret (already in env).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

const BIG_ROOM_THRESHOLD = 1000;
const BUSINESS_INCLUDED_MINUTES = 60;
const SECONDS_PER_HOUR = 3600;

interface RoomAdmin {
    $id: string;
    roomId: string;
    adminId: string;
}

interface SubscriptionDoc {
    $id: string;
    userId: string;
    tier: TierId;
    stripeCustomerId: string;
}

interface ActiveRoom {
    $id: string;
    roomSid: string;
    roomName: string;
    creatorOrgId?: string;
    participantCount: number;
    isRecording: boolean;
    region?: string;
    lastEventAt: string;
}

function buildDatabases(): ServerDatabases | null {
    if (!API_KEY) return null;
    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    return new ServerDatabases(client);
}

async function findActiveRoom(
    databases: ServerDatabases,
    roomSid: string,
): Promise<ActiveRoom | null> {
    const res = await databases
        .listDocuments(DB_ID, 'active_rooms', [Query.equal('roomSid', roomSid), Query.limit(1)])
        .catch(() => null);
    return (res?.documents[0] as unknown as ActiveRoom) ?? null;
}

async function findRoomCreatorSubscription(
    databases: ServerDatabases,
    roomName: string,
): Promise<SubscriptionDoc | null> {
    // room_admins maps roomId (== roomName for our app) → adminId.
    // We snapshot the creator at room-create time in trackAdminRoom().
    const admins = await databases
        .listDocuments(DB_ID, 'room_admins', [Query.equal('roomId', roomName), Query.limit(1)])
        .catch(() => null);
    const admin = admins?.documents[0] as unknown as RoomAdmin | undefined;
    if (!admin) return null;
    const subs = await databases
        .listDocuments(DB_ID, 'subscriptions', [
            Query.equal('userId', admin.adminId),
            Query.equal('status', ['active', 'trialing']),
            Query.orderDesc('$updatedAt'),
            Query.limit(1),
        ])
        .catch(() => null);
    return (subs?.documents[0] as unknown as SubscriptionDoc) ?? null;
}

async function fireBusinessOverageMeter(
    customerId: string,
    roomSid: string,
    extraHours: number,
): Promise<void> {
    if (extraHours <= 0) return;
    const stripe = requireStripe();
    await stripe.billing.meterEvents.create({
        event_name: 'business_extra_hours',
        payload: {
            stripe_customer_id: customerId,
            value: String(extraHours),
        },
        identifier: `${roomSid}:business_overage`,
    });
}

async function fireBigRoomMeter(customerId: string, roomSid: string): Promise<void> {
    const stripe = requireStripe();
    await stripe.billing.meterEvents.create({
        event_name: 'concurrent_big_room_session',
        payload: {
            stripe_customer_id: customerId,
            value: '1',
        },
        identifier: `${roomSid}:big_room`,
    });
}

async function upsertActiveRoom(
    databases: ServerDatabases,
    fields: {
        roomSid: string;
        roomName: string;
        participantCount?: number;
        isRecording?: boolean;
        creatorOrgId?: string;
        region?: string;
    },
): Promise<ActiveRoom> {
    const existing = await findActiveRoom(databases, fields.roomSid);
    const nowIso = new Date().toISOString();
    const writeFields: Record<string, unknown> = {
        roomSid: fields.roomSid,
        roomName: fields.roomName,
        participantCount: fields.participantCount ?? existing?.participantCount ?? 0,
        isRecording: fields.isRecording ?? existing?.isRecording ?? false,
        lastEventAt: nowIso,
    };
    if (fields.creatorOrgId !== undefined) writeFields.creatorOrgId = fields.creatorOrgId;
    if (fields.region !== undefined) writeFields.region = fields.region;
    if (existing) {
        await databases.updateDocument(DB_ID, 'active_rooms', existing.$id, writeFields);
        return { ...existing, ...(writeFields as Partial<ActiveRoom>) } as ActiveRoom;
    }
    const created = await databases.createDocument(
        DB_ID,
        'active_rooms',
        ID.unique(),
        writeFields,
    );
    return created as unknown as ActiveRoom;
}

async function stampSessionLeftAt(
    databases: ServerDatabases,
    identity: string,
    roomSid: string,
): Promise<void> {
    const sessions = await databases
        .listDocuments(DB_ID, 'session_logs', [
            Query.equal('roomSid', roomSid),
            Query.equal('identity', identity),
            Query.isNull('leftAt'),
            Query.orderDesc('joinedAt'),
            Query.limit(1),
        ])
        .catch(() => null);
    const doc = sessions?.documents[0];
    if (!doc) return;
    await databases.updateDocument(DB_ID, 'session_logs', doc.$id, {
        leftAt: new Date().toISOString(),
    });
}

export async function POST(request: Request) {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        console.error('[livekit/webhook] LIVEKIT_API_KEY/SECRET not configured');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const rawBody = await request.text();
    const authHeader = request.headers.get('authorization') ?? '';

    const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    let event;
    try {
        event = await receiver.receive(rawBody, authHeader);
    } catch (err: any) {
        console.warn('[livekit/webhook] signature verification failed:', err?.message ?? err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const databases = buildDatabases();
    if (!databases) {
        // Misconfigured — log and 200 so LiveKit doesn't retry forever.
        console.error('[livekit/webhook] APPWRITE_API_KEY missing — event dropped:', event.event);
        return NextResponse.json({ received: true, dropped: true });
    }

    try {
        switch (event.event) {
            case 'room_started': {
                const room = event.room;
                if (!room) break;
                await upsertActiveRoom(databases, {
                    roomSid: room.sid,
                    roomName: room.name,
                    participantCount: 0,
                });
                break;
            }
            case 'room_finished': {
                const room = event.room;
                if (!room) break;
                // Compute duration. LiveKit reports creationTime as bigint seconds.
                const startedAt = Number(room.creationTime ?? 0n);
                const endedAtSec = Math.floor(Date.now() / 1000);
                const durationSec = startedAt > 0 ? endedAtSec - startedAt : 0;
                // Business hourly overage. Fire once with hours beyond included.
                const sub = await findRoomCreatorSubscription(databases, room.name);
                if (
                    sub &&
                    sub.tier === 'business' &&
                    durationSec > BUSINESS_INCLUDED_MINUTES * 60
                ) {
                    const extraSeconds = durationSec - BUSINESS_INCLUDED_MINUTES * 60;
                    const extraHours = Math.ceil(extraSeconds / SECONDS_PER_HOUR);
                    try {
                        await fireBusinessOverageMeter(sub.stripeCustomerId, room.sid, extraHours);
                    } catch (err: any) {
                        console.error(
                            '[livekit/webhook] business overage meter failed:',
                            err?.message ?? err,
                        );
                    }
                }
                // Remove from active_rooms.
                const existing = await findActiveRoom(databases, room.sid);
                if (existing) {
                    await databases
                        .deleteDocument(DB_ID, 'active_rooms', existing.$id)
                        .catch(() => undefined);
                }
                break;
            }
            case 'participant_joined': {
                const room = event.room;
                if (!room) break;
                const existing = await upsertActiveRoom(databases, {
                    roomSid: room.sid,
                    roomName: room.name,
                    participantCount:
                        (event.room?.numParticipants ?? 0) ||
                        ((await findActiveRoom(databases, room.sid))?.participantCount ?? 0) + 1,
                });
                // Big-room fee: Enterprise only, once per session.
                if (existing.participantCount >= BIG_ROOM_THRESHOLD) {
                    const sub = await findRoomCreatorSubscription(databases, room.name);
                    if (sub && sub.tier === 'enterprise') {
                        try {
                            await fireBigRoomMeter(sub.stripeCustomerId, room.sid);
                        } catch (err: any) {
                            // Stripe duplicate-identifier returns a benign error — log and continue.
                            const msg = err?.message ?? String(err);
                            if (!/idempotent|duplicate/i.test(msg)) {
                                console.error(
                                    '[livekit/webhook] big-room meter failed:',
                                    msg,
                                );
                            }
                        }
                    }
                }
                break;
            }
            case 'participant_left': {
                const room = event.room;
                if (!room) break;
                const existing = await findActiveRoom(databases, room.sid);
                if (existing) {
                    const reportedCount = room.numParticipants ?? existing.participantCount - 1;
                    await databases.updateDocument(DB_ID, 'active_rooms', existing.$id, {
                        participantCount: Math.max(0, Math.floor(reportedCount)),
                        lastEventAt: new Date().toISOString(),
                    });
                }
                const identity = event.participant?.identity;
                if (identity) {
                    await stampSessionLeftAt(databases, identity, room.sid).catch(() => undefined);
                }
                break;
            }
            case 'egress_started':
            case 'egress_ended': {
                // Egress payload carries roomName, not sid; look up by name.
                const roomName = event.egressInfo?.roomName ?? event.room?.name;
                if (!roomName) break;
                const isStart = event.event === 'egress_started';
                const all = await databases
                    .listDocuments(DB_ID, 'active_rooms', [
                        Query.equal('roomName', roomName),
                        Query.limit(1),
                    ])
                    .catch(() => null);
                const row = all?.documents[0];
                if (row) {
                    await databases.updateDocument(DB_ID, 'active_rooms', row.$id, {
                        isRecording: isStart,
                        lastEventAt: new Date().toISOString(),
                    });
                }
                break;
            }
            default:
                break;
        }
    } catch (err: any) {
        console.error(
            '[livekit/webhook] handler for',
            event.event,
            'failed:',
            err?.message ?? err,
        );
        // Still 200 — LiveKit retries are not idempotent and a poison
        // event would loop forever. Surface via logs / monitoring.
    }

    return NextResponse.json({ received: true, event: event.event });
}
