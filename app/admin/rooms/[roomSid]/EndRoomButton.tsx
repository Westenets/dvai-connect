'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Confirm-then-call client button. The actual room termination
 * happens in /api/admin/rooms/[name]/end via the LiveKit RoomService.
 */
export function EndRoomButton({ roomName }: { roomName: string }) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const end = async () => {
        setPending(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/rooms/${encodeURIComponent(roomName)}/end`, {
                method: 'POST',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            router.refresh();
            router.push('/admin/rooms');
        } catch (e: any) {
            setError(e?.message ?? 'Failed to end meeting');
        } finally {
            setPending(false);
            setConfirming(false);
        }
    };

    if (!confirming) {
        return (
            <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2"
            >
                End meeting for everyone
            </button>
        );
    }
    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={end}
                disabled={pending}
                className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
            >
                {pending ? 'Ending…' : 'Confirm end'}
            </button>
        </div>
    );
}
