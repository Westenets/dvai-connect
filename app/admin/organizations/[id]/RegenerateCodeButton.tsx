'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RegenerateCodeButton({ orgId }: { orgId: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const regen = async () => {
        if (
            !confirm(
                'Regenerate the signup code? Any unread invite URL already sent to cohort members will stop working.',
            )
        )
            return;
        setBusy(true);
        try {
            const res = await fetch(
                `/api/admin/organizations/${encodeURIComponent(orgId)}/regenerate`,
                { method: 'POST' },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                alert(body.error ?? `HTTP ${res.status}`);
            } else {
                router.refresh();
            }
        } catch (err: any) {
            alert(err?.message ?? 'Regenerate failed');
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={regen}
            disabled={busy}
            className="rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
        >
            {busy ? 'Regenerating…' : 'Regenerate code'}
        </button>
    );
}
