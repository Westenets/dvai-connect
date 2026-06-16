import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { RoomServiceClient } from 'livekit-server-sdk';
import { DataTable, formatRelative, type Column } from '@/lib/components/admin/DataTable';
import { EndRoomButton } from './EndRoomButton';

/**
 * Per-room admin detail page.
 *
 * Reads the active_rooms row for context, lists session_logs for the
 * full participant audit trail (join time, IP, UA, identity), and
 * provides the End Meeting action.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 5;

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

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

interface SessionLog {
    $id: string;
    sessionId: string;
    identity: string;
    orgId?: string;
    ip?: string;
    userAgent?: string;
    joinedAt: string;
    leftAt?: string;
    roomSid: string;
}

interface LiveParticipant {
    identity: string;
    name: string;
    kind: number;
    state: number;
    joinedAt?: number;
    region?: string;
}

async function loadRoomData(roomSid: string): Promise<{
    room: ActiveRoom | null;
    sessions: SessionLog[];
    liveParticipants: LiveParticipant[];
} | null> {
    if (!API_KEY) return null;
    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    const databases = new ServerDatabases(client);
    let room: ActiveRoom | null = null;
    let sessions: SessionLog[] = [];
    try {
        const roomRes = await databases.listDocuments(DB_ID, 'active_rooms', [
            Query.equal('roomSid', roomSid),
            Query.limit(1),
        ]);
        room = (roomRes.documents[0] as unknown as ActiveRoom) ?? null;
        const sessionsRes = await databases.listDocuments(DB_ID, 'session_logs', [
            Query.equal('roomSid', roomSid),
            Query.orderDesc('joinedAt'),
            Query.limit(200),
        ]);
        sessions = sessionsRes.documents as unknown as SessionLog[];
    } catch (err: any) {
        console.warn('[admin/rooms/[sid]] load failed:', err?.message ?? err);
    }

    // Best-effort live participant list from LiveKit. Falls back to
    // session_logs view-only if the LiveKit API is unreachable.
    const liveParticipants: LiveParticipant[] = [];
    if (room && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY) {
        try {
            const roomSvc = new RoomServiceClient(
                process.env.LIVEKIT_URL,
                process.env.LIVEKIT_API_KEY,
                process.env.LIVEKIT_API_SECRET,
            );
            const parts = await roomSvc.listParticipants(room.roomName);
            for (const p of parts) {
                liveParticipants.push({
                    identity: p.identity,
                    name: p.name ?? p.identity,
                    kind: p.kind as unknown as number,
                    state: p.state as unknown as number,
                    joinedAt: Number(p.joinedAt ?? 0n),
                    region: p.region,
                });
            }
        } catch (err: any) {
            console.warn('[admin/rooms/[sid]] listParticipants failed:', err?.message ?? err);
        }
    }

    return { room, sessions, liveParticipants };
}

const PARTICIPANT_KIND_LABEL: Record<number, string> = {
    0: 'Standard',
    1: 'Ingress',
    2: 'Egress',
    3: 'SIP',
    4: 'Agent',
};

export default async function AdminRoomDetailPage({
    params,
}: {
    params: Promise<{ roomSid: string }>;
}) {
    const { roomSid: rawSid } = await params;
    const roomSid = decodeURIComponent(rawSid);
    const data = await loadRoomData(roomSid);
    if (!data) {
        return (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
                APPWRITE_API_KEY missing — admin data unavailable.
            </div>
        );
    }
    const { room, sessions, liveParticipants } = data;

    const sessionColumns: Array<Column<SessionLog>> = [
        {
            key: 'identity',
            header: 'Identity',
            render: (r) => <code className="font-mono text-xs">{r.identity}</code>,
        },
        { key: 'orgId', header: 'Org', muted: true, render: (r) => r.orgId ?? '—' },
        {
            key: 'joinedAt',
            header: 'Joined',
            muted: true,
            render: (r) => formatRelative(r.joinedAt),
        },
        {
            key: 'leftAt',
            header: 'Left',
            muted: true,
            render: (r) =>
                r.leftAt ? (
                    formatRelative(r.leftAt)
                ) : (
                    <span className="text-emerald-500">Still in</span>
                ),
        },
        { key: 'ip', header: 'IP', muted: true, render: (r) => r.ip ?? '—' },
        {
            key: 'userAgent',
            header: 'User-Agent',
            muted: true,
            render: (r) => (
                <span className="truncate max-w-xs inline-block" title={r.userAgent}>
                    {r.userAgent ?? '—'}
                </span>
            ),
        },
    ];

    const liveColumns: Array<Column<LiveParticipant>> = [
        {
            key: 'identity',
            header: 'Identity',
            render: (p) => <code className="font-mono text-xs">{p.identity}</code>,
        },
        { key: 'name', header: 'Name', render: (p) => p.name },
        {
            key: 'kind',
            header: 'Kind',
            align: 'center',
            render: (p) => (
                <span
                    className={
                        'inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                        (p.kind === 4
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
                            : p.kind === 2
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')
                    }
                >
                    {PARTICIPANT_KIND_LABEL[p.kind] ?? p.kind}
                </span>
            ),
        },
        { key: 'region', header: 'Region', muted: true, render: (p) => p.region ?? '—' },
        {
            key: 'joinedAt',
            header: 'Joined',
            muted: true,
            render: (p) =>
                p.joinedAt && p.joinedAt > 0
                    ? formatRelative(new Date(p.joinedAt * 1000).toISOString())
                    : '—',
        },
    ];

    return (
        <div>
            <div className="mb-6">
                <Link href="/admin/rooms" className="text-sm text-slate-500 hover:text-emerald-500">
                    ← All rooms
                </Link>
            </div>

            <header className="flex items-end justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold mb-1">
                        {room?.roomName ?? 'Room not found'}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        SID <code className="font-mono">{roomSid}</code>
                        {room?.region && (
                            <>
                                {' · '}
                                Region <span className="font-mono">{room.region}</span>
                            </>
                        )}
                        {room?.isRecording && (
                            <>
                                {' · '}
                                <span className="text-red-600 dark:text-red-400 font-semibold">
                                    Recording
                                </span>
                            </>
                        )}
                    </p>
                </div>
                {room && <EndRoomButton roomName={room.roomName} />}
            </header>

            <DisclosureBanner />

            <h2 className="text-lg font-semibold mb-3">
                Live participants ({liveParticipants.length})
            </h2>
            <DataTable
                columns={liveColumns}
                rows={liveParticipants}
                rowKey={(p) => p.identity}
                emptyState={
                    room
                        ? 'No participants reported by LiveKit (room may be empty or the LiveKit API was unreachable).'
                        : 'Room not found.'
                }
            />

            <h2 className="text-lg font-semibold mt-10 mb-3">
                Session audit log ({sessions.length})
            </h2>
            <DataTable
                columns={sessionColumns}
                rows={sessions}
                rowKey={(r) => r.sessionId}
                emptyState="No session logs recorded for this room."
            />
        </div>
    );
}

function DisclosureBanner() {
    return (
        <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
            <strong className="font-semibold">Privacy:</strong> Identities, IPs, and user agents
            below come from session_logs. The meeting's audio and video remain end-to-end encrypted
            — this admin view never displays media content. Ending the meeting terminates the room
            for everyone but does not generate a transcript.
        </div>
    );
}
