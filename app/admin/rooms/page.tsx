import Link from 'next/link';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { DataTable, formatRelative, type Column } from '@/lib/components/admin/DataTable';

/**
 * Admin Rooms list — live monitor.
 *
 * Reads from active_rooms (populated by the LiveKit webhook handler).
 * Auto-refresh by setting `revalidate` to a short interval; for a
 * truly live feed swap to client-side polling or Appwrite Realtime.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 5; // 5s revalidation

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

async function loadActiveRooms(): Promise<ActiveRoom[] | null> {
    if (!API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'active_rooms', [
            Query.orderDesc('lastEventAt'),
            Query.limit(100),
        ]);
        return res.documents as unknown as ActiveRoom[];
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) return [];
        console.warn('[admin/rooms] loadActiveRooms failed:', msg);
        return null;
    }
}

export default async function AdminRoomsPage() {
    const rooms = await loadActiveRooms();

    const columns: Array<Column<ActiveRoom>> = [
        {
            key: 'roomName',
            header: 'Room',
            render: (r) => (
                <Link
                    href={`/admin/rooms/${encodeURIComponent(r.roomSid)}`}
                    className="font-semibold underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                    {r.roomName}
                </Link>
            ),
        },
        {
            key: 'roomSid',
            header: 'SID',
            muted: true,
            render: (r) => <code className="font-mono">{r.roomSid}</code>,
        },
        {
            key: 'participantCount',
            header: 'Participants',
            align: 'right',
            render: (r) => (
                <span className={r.participantCount >= 1000 ? 'font-bold text-amber-600 dark:text-amber-400' : ''}>
                    {r.participantCount}
                </span>
            ),
        },
        {
            key: 'isRecording',
            header: 'Recording',
            align: 'center',
            render: (r) =>
                r.isRecording ? (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Recording
                    </span>
                ) : (
                    <span className="text-slate-400">—</span>
                ),
        },
        { key: 'region', header: 'Region', muted: true, render: (r) => r.region ?? '—' },
        {
            key: 'lastEventAt',
            header: 'Last activity',
            muted: true,
            render: (r) => formatRelative(r.lastEventAt),
        },
    ];

    return (
        <div>
            <header className="flex items-end justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold mb-1">Rooms</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Live room monitor. Refreshes every 5 seconds. Drill into a
                        room for the full participant table and per-track encryption
                        badges.
                    </p>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live ({rooms?.length ?? 0})
                </div>
            </header>

            <DisclosureBanner />

            <DataTable
                columns={columns}
                rows={rooms ?? []}
                rowKey={(r) => r.roomSid}
                emptyState={
                    rooms === null
                        ? 'KPI source unavailable (APPWRITE_API_KEY missing or active_rooms collection not migrated).'
                        : 'No live rooms right now. The LiveKit webhook will populate this view as meetings start.'
                }
            />
        </div>
    );
}

function DisclosureBanner() {
    return (
        <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
            <strong className="font-semibold">Privacy note:</strong>{' '}
            Room metadata (name, participant count, recording state) is visible to
            admins because the LiveKit server publishes it. Media content is not
            decrypted server-side — admins cannot read meeting audio or video
            even from here. End-meeting actions terminate the room for everyone
            but do not produce a transcript.
        </div>
    );
}
