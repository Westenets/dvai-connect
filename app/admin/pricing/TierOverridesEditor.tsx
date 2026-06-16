'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TierId } from '@/lib/pricing/tiers';

interface OverrideRow {
    tier: TierId;
    defaultDisplayName: string;
    defaultBadge: string;
    displayName?: string;
    badge?: string;
    description?: string;
    headlineCopy?: string;
    bullets?: string[];
}

/**
 * Per-tier override editor. The admin sees one collapsed row per
 * tier with the current effective copy (override or default).
 * Expanding reveals fields they can edit; Save POSTs to
 * /api/admin/pricing/[tier]. Clear removes the override row.
 */
export function TierOverridesEditor({ initialRows }: { initialRows: OverrideRow[] }) {
    return (
        <ul className="space-y-3">
            {initialRows.map((row) => (
                <TierRow key={row.tier} initial={row} />
            ))}
        </ul>
    );
}

function TierRow({ initial }: { initial: OverrideRow }) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    const [displayName, setDisplayName] = useState(initial.displayName ?? '');
    const [badge, setBadge] = useState(initial.badge ?? '');
    const [description, setDescription] = useState(initial.description ?? '');
    const [headlineCopy, setHeadlineCopy] = useState(initial.headlineCopy ?? '');
    const [bulletsText, setBulletsText] = useState((initial.bullets ?? []).join('\n'));
    const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const hasOverride =
        !!initial.displayName ||
        !!initial.badge ||
        !!initial.description ||
        !!initial.headlineCopy ||
        (initial.bullets ?? []).length > 0;

    const save = async () => {
        setBusy('save');
        setError(null);
        try {
            const bullets = bulletsText
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            const res = await fetch(`/api/admin/pricing/${initial.tier}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, badge, description, headlineCopy, bullets }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setSaved(true);
            router.refresh();
            setTimeout(() => setSaved(false), 1500);
        } catch (err: any) {
            setError(err?.message ?? 'Save failed');
        } finally {
            setBusy(null);
        }
    };

    const clear = async () => {
        if (!confirm('Remove the override for this tier and revert to the static default?')) return;
        setBusy('clear');
        setError(null);
        try {
            const res = await fetch(`/api/admin/pricing/${initial.tier}`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setDisplayName('');
            setBadge('');
            setDescription('');
            setHeadlineCopy('');
            setBulletsText('');
            router.refresh();
        } catch (err: any) {
            setError(err?.message ?? 'Clear failed');
        } finally {
            setBusy(null);
        }
    };

    return (
        <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex justify-between items-center px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left"
            >
                <span>
                    <span className="font-semibold">{initial.defaultDisplayName}</span>
                    <span className="ml-3 text-xs text-slate-500 dark:text-slate-400">
                        {hasOverride ? 'override active' : 'default copy'}
                    </span>
                </span>
                <span className="text-slate-400">{expanded ? '▾' : '▸'}</span>
            </button>
            {expanded && (
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <Field label={`Display name (default: ${initial.defaultDisplayName})`}>
                        <input
                            type="text"
                            maxLength={64}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="input"
                        />
                    </Field>
                    <Field label={`Badge (default: ${initial.defaultBadge || 'none'})`}>
                        <input
                            type="text"
                            maxLength={64}
                            value={badge}
                            onChange={(e) => setBadge(e.target.value)}
                            className="input"
                            placeholder="Most popular"
                        />
                    </Field>
                    <Field label="Description (one short sentence)">
                        <input
                            type="text"
                            maxLength={512}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="input"
                        />
                    </Field>
                    <Field label="Headline copy (optional — appears above the bullets)">
                        <textarea
                            rows={2}
                            maxLength={1024}
                            value={headlineCopy}
                            onChange={(e) => setHeadlineCopy(e.target.value)}
                            className="input"
                        />
                    </Field>
                    <Field label="Bullets (one per line — overrides the default bullets entirely)">
                        <textarea
                            rows={6}
                            value={bulletsText}
                            onChange={(e) => setBulletsText(e.target.value)}
                            className="input"
                            placeholder={'1-hour meetings\nUp to 100 participants\nCloud recording'}
                        />
                    </Field>
                    {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
                    {saved && (
                        <div className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</div>
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={busy === 'save'}
                            className="rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 text-sm font-semibold px-4 py-2"
                        >
                            {busy === 'save' ? 'Saving…' : 'Save override'}
                        </button>
                        {hasOverride && (
                            <button
                                type="button"
                                onClick={clear}
                                disabled={busy === 'clear'}
                                className="rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-sm font-semibold px-4 py-2"
                            >
                                {busy === 'clear' ? 'Clearing…' : 'Revert to default'}
                            </button>
                        )}
                    </div>
                </div>
            )}
            <style jsx>{`
                .input {
                    width: 100%;
                    border-radius: 0.5rem;
                    border: 1px solid rgb(203 213 225);
                    background: white;
                    padding: 0.5rem 0.75rem;
                    font-size: 0.875rem;
                }
                :global(.dark) .input {
                    border-color: rgb(51 65 85);
                    background: rgb(15 23 42);
                    color: rgb(248 250 252);
                }
            `}</style>
        </li>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">
                {label}
            </div>
            {children}
        </label>
    );
}
