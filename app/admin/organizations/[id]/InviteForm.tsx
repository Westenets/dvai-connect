'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Inline invite form on the org detail page. Calls
 * /api/admin/organizations/[id]/invite which forwards to Appwrite
 * Teams.createMembership — Appwrite emails the invitee a confirmation
 * link.
 */
export function InviteForm({ orgId }: { orgId: string }) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<'member' | 'admin' | 'owner'>('member');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch(`/api/admin/organizations/${encodeURIComponent(orgId)}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), name: name.trim(), roles: role }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setResult({ kind: 'ok', msg: `Invite sent to ${email}.` });
            setEmail('');
            setName('');
            router.refresh();
        } catch (err: any) {
            setResult({ kind: 'err', msg: err?.message ?? 'Invite failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[200px]">
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">
                    Email
                </div>
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    placeholder="person@company.com"
                />
            </label>
            <label className="flex-1 min-w-[160px]">
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">
                    Name (optional)
                </div>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                    placeholder="Jane Doe"
                />
            </label>
            <label>
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">
                    Role
                </div>
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                    className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                </select>
            </label>
            <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 text-sm font-semibold px-4 py-2"
            >
                {busy ? 'Sending…' : 'Send invite'}
            </button>
            {result && (
                <div
                    className={
                        'w-full text-xs ' +
                        (result.kind === 'ok'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400')
                    }
                >
                    {result.msg}
                </div>
            )}
        </form>
    );
}
