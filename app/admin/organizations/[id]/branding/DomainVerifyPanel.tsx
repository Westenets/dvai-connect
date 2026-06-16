'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
    orgId: string;
    customDomain?: string;
    token?: string;
    status?: 'pending' | 'verified' | 'failed';
    verifiedAt?: string | null;
    checkedAt?: string | null;
    lastError?: string | null;
}

/**
 * Side-panel UI for the DNS verification flow. Shows the TXT record
 * instructions, current status, last check time, and a "Verify now"
 * button that calls /api/admin/organizations/[id]/branding/verify-domain.
 *
 * Why this is in its own component:
 *   - it only matters after the branding row is saved (token is
 *     server-generated on save).
 *   - DNS state changes asynchronously, independent of every other
 *     branding field — keeping it separate from BrandingForm means
 *     the form's dirty-state tracking stays simple.
 */
export function DomainVerifyPanel({
    orgId,
    customDomain,
    token,
    status,
    verifiedAt,
    checkedAt,
    lastError,
}: Props) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<
        | null
        | { kind: 'ok'; checkedAt: string }
        | { kind: 'err'; message: string; recordsSeen?: string[] }
    >(null);

    if (!customDomain) {
        return (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 text-sm text-slate-600 dark:text-slate-300">
                Enter a <code>customDomain</code> above and save to start the DNS verification flow.
            </div>
        );
    }
    if (!token) {
        return (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
                Save the branding form to mint a verification token. If you've already saved and
                still see this, run{' '}
                <code>scripts/appwrite-migrate-domain-verify-2026-06-14.mjs</code> to add the
                verification columns to <code>org_branding</code>.
            </div>
        );
    }

    const txtHost = `_dvai-connect.${customDomain}`;
    const txtValue = `dvai-verify=${token}`;

    const verify = async () => {
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch(
                `/api/admin/organizations/${encodeURIComponent(orgId)}/branding/verify-domain`,
                { method: 'POST' },
            );
            const body = (await res.json()) as {
                ok?: boolean;
                error?: string;
                checkedAt?: string;
                recordsSeen?: string[];
            };
            if (res.ok && body.ok) {
                setResult({ kind: 'ok', checkedAt: body.checkedAt ?? new Date().toISOString() });
                router.refresh();
            } else {
                setResult({
                    kind: 'err',
                    message: body.error ?? `HTTP ${res.status}`,
                    recordsSeen: body.recordsSeen,
                });
                router.refresh();
            }
        } catch (err: any) {
            setResult({ kind: 'err', message: err?.message ?? 'Verify failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">DNS verification</h3>
                <StatusPill status={status} />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
                Add a single TXT record at your DNS provider to prove you own this domain. Routing
                live traffic to it is a separate step handled at your Apache / reverse proxy layer.
            </p>

            <div className="space-y-2 text-xs">
                <Row label="Type" value="TXT" mono />
                <Row label="Host / Name" value={txtHost} mono copyable />
                <Row label="Value" value={txtValue} mono copyable />
                <Row label="TTL" value="300 (or your provider's minimum)" />
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={verify}
                    disabled={busy}
                    className="rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 text-sm font-semibold px-4 py-2"
                >
                    {busy ? 'Checking DNS…' : status === 'verified' ? 'Re-check' : 'Verify now'}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    DNS propagation can take 1–60 minutes after you add the record.
                </span>
            </div>

            {result?.kind === 'ok' && (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
                    Verified. We resolved the matching TXT record at <code>{txtHost}</code>.
                </div>
            )}
            {result?.kind === 'err' && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-900 dark:text-red-100">
                    <p className="font-semibold mb-1">Couldn't verify yet.</p>
                    <p className="text-xs">{result.message}</p>
                    {result.recordsSeen && result.recordsSeen.length > 0 && (
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs">
                                Records we saw ({result.recordsSeen.length})
                            </summary>
                            <ul className="mt-1 text-xs space-y-1 font-mono">
                                {result.recordsSeen.map((r) => (
                                    <li key={r}>{r}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}
            {!result && status === 'failed' && lastError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-xs text-red-900 dark:text-red-100">
                    Last check failed: {lastError}
                </div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-4">
                {verifiedAt && (
                    <span>
                        Verified at <time dateTime={verifiedAt}>{formatTime(verifiedAt)}</time>
                    </span>
                )}
                {checkedAt && (
                    <span>
                        Last checked <time dateTime={checkedAt}>{formatTime(checkedAt)}</time>
                    </span>
                )}
            </div>
        </div>
    );
}

function StatusPill({ status }: { status?: 'pending' | 'verified' | 'failed' }) {
    const tone: Record<string, string> = {
        verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
        pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
    };
    const label = status ?? 'pending';
    return (
        <span
            className={
                'inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                (tone[label] ?? tone.pending)
            }
        >
            {label}
        </span>
    );
}

function Row({
    label,
    value,
    mono,
    copyable,
}: {
    label: string;
    value: string;
    mono?: boolean;
    copyable?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {label}
            </span>
            <code
                className={
                    'flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 ' +
                    (mono ? 'font-mono' : '')
                }
            >
                {value}
            </code>
            {copyable && (
                <button
                    type="button"
                    className="text-emerald-600 dark:text-emerald-400 text-xs underline decoration-dotted underline-offset-4"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(value);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1200);
                        } catch {
                            // no-op
                        }
                    }}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            )}
        </div>
    );
}

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}
