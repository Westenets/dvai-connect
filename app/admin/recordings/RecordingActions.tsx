'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    id: string;
    recordingUrl?: string;
    status?: string;
    egressId?: string;
    roomName?: string;
}

/**
 * Per-row admin actions for recordings:
 *   - Open: direct link to the recording_url (if completed)
 *   - Force-stop: cancels the underlying egress (if still recording)
 *   - Delete: removes the recordings row (does NOT delete the file
 *     from storage — separate retention process)
 */
export function RecordingActions({ id, recordingUrl, status, egressId, roomName }: Props) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    const call = async (label: string, url: string, method: string) => {
        setBusy(label);
        try {
            const res = await fetch(url, { method });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                alert(body.error ?? `HTTP ${res.status}`);
            } else {
                router.refresh();
            }
        } catch (err: any) {
            alert(err?.message ?? 'Action failed');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="inline-flex gap-2">
            {recordingUrl && (
                <a
                    href={recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    Open
                </a>
            )}
            {status === 'recording' && egressId && roomName && (
                <button
                    type="button"
                    disabled={busy === 'stop'}
                    onClick={() =>
                        call(
                            'stop',
                            `/api/admin/recordings/${encodeURIComponent(id)}/stop?roomName=${encodeURIComponent(roomName)}`,
                            'POST',
                        )
                    }
                    className="rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1.5 text-xs text-white"
                >
                    {busy === 'stop' ? '…' : 'Force stop'}
                </button>
            )}
            <button
                type="button"
                disabled={busy === 'delete'}
                onClick={() => {
                    if (
                        !confirm(
                            'Delete this recording row? The file in storage is not removed by this action.',
                        )
                    )
                        return;
                    call('delete', `/api/admin/recordings/${encodeURIComponent(id)}`, 'DELETE');
                }}
                className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 px-3 py-1.5 text-xs text-white"
            >
                {busy === 'delete' ? '…' : 'Delete'}
            </button>
        </div>
    );
}
