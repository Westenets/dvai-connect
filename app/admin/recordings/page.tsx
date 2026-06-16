import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { DataTable, formatDateTime, type Column } from '@/lib/components/admin/DataTable';
import { RecordingActions } from './RecordingActions';

/**
 * Admin Recordings — bypasses the per-user `participant_ids` filter
 * that gates the public /recordings page. Admins see every recording.
 *
 * Server-rendered list with per-row actions (open, force-stop, delete)
 * that go through /api/admin/recordings/[id]/* handlers.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface Recording {
    $id: string;
    $createdAt: string;
    room_name?: string;
    file_name?: string;
    recording_url?: string;
    thumbnail?: string;
    status?: string;
    started_by?: string;
    egress_id?: string;
    owner?: string[];
    participant_ids?: string[];
}

async function loadAllRecordings(): Promise<Recording[] | null> {
    if (!API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'recordings', [
            Query.orderDesc('$createdAt'),
            Query.limit(200),
        ]);
        return res.documents as unknown as Recording[];
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) return [];
        console.warn('[admin/recordings] load failed:', msg);
        return null;
    }
}

export default async function AdminRecordingsPage() {
    const rows = await loadAllRecordings();

    const columns: Array<Column<Recording>> = [
        {
            key: 'room_name',
            header: 'Meeting',
            render: (r) => (
                <span className="font-semibold">{r.room_name ?? r.file_name ?? r.$id}</span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            align: 'center',
            render: (r) => <StatusBadge status={r.status ?? 'unknown'} />,
        },
        {
            key: 'started_by',
            header: 'Started by',
            muted: true,
            render: (r) => r.started_by ?? '—',
        },
        {
            key: '$createdAt',
            header: 'Recorded',
            muted: true,
            render: (r) => formatDateTime(r.$createdAt),
        },
        {
            key: 'owner',
            header: 'Owners',
            muted: true,
            render: (r) => (r.owner && r.owner.length > 0 ? r.owner.length : '—'),
            align: 'center',
        },
    ];

    return (
        <div>
            <header className="mb-6">
                <h1 className="text-2xl font-semibold mb-1">Recordings</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Every recording in this workspace. Admin actions bypass the per-user owner
                    filter that gates the public /recordings page.
                </p>
            </header>

            <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
                <strong className="font-semibold">Disclosure:</strong> Recording content lives in
                server-side storage protected by server-side encryption, not E2EE. Admin downloads +
                opens are auditable. Forced-stop terminates egress mid-recording and may leave a
                truncated file.
            </div>

            <DataTable
                columns={columns}
                rows={rows ?? []}
                rowKey={(r) => r.$id}
                actions={(r) => (
                    <RecordingActions
                        id={r.$id}
                        recordingUrl={r.recording_url}
                        status={r.status}
                        egressId={r.egress_id}
                        roomName={r.room_name}
                    />
                )}
                emptyState={
                    rows === null
                        ? 'KPI source unavailable (APPWRITE_API_KEY missing or recordings collection not migrated).'
                        : 'No recordings yet.'
                }
            />
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const tone: Record<string, string> = {
        completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
        recording: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
    };
    return (
        <span
            className={
                'inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                (tone[status] ??
                    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')
            }
        >
            {status}
        </span>
    );
}
