'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/**
 * /billing — user-facing subscription panel.
 *
 * Free users see the current plan + a CTA to /pricing.
 * Paid users see plan, next-bill date, cancellation status, and a
 *   "Manage subscription" button that opens the Stripe Customer Portal.
 * Africa-cohort users see their commitment-end date and a notice that
 *   cancellation requires coordination with their cohort admin (the
 *   Africa portal config has cancel + update disabled).
 */

interface SubscriptionSummary {
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    isAfricaCohort: boolean;
    africaCommitmentEnd: string | null;
    stripeCustomerId: string;
}

interface BillingStatus {
    authenticated: boolean;
    tier?: string;
    subscription?: SubscriptionSummary | null;
    warning?: string;
}

export default function BillingPage() {
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [portalBusy, setPortalBusy] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoading && !user) router.push('/login?next=/billing');
    }, [isLoading, user, router]);

    useEffect(() => {
        if (!user) return;
        fetch('/api/billing/status')
            .then((res) => res.json())
            .then(setStatus)
            .catch((err) => setStatus({ authenticated: true, warning: err?.message }));
    }, [user]);

    const openPortal = async () => {
        setPortalBusy(true);
        setPortalError(null);
        try {
            const res = await fetch('/api/portal', { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const body = (await res.json()) as { url: string };
            window.location.href = body.url;
        } catch (err: any) {
            setPortalError(err?.message ?? 'Failed to open portal');
            setPortalBusy(false);
        }
    };

    if (isLoading || !status) {
        return (
            <div className="bg-[#080c11] text-[#f1f3f4] font-['Inter',sans-serif] h-full overflow-y-auto antialiased flex items-center justify-center p-6">
                <div className="text-sm text-[#c0c7d5]">Loading…</div>
            </div>
        );
    }

    const isFree = !status.subscription;
    const sub = status.subscription;

    return (
        <div className="bg-[#080c11] text-[#f1f3f4] font-['Inter',sans-serif] h-full overflow-y-auto antialiased">
            <header className="px-6 py-6 max-w-3xl mx-auto">
                <a href="/" className="inline-flex items-center gap-2">
                    <img src="/images/livekit-meet-home.svg" alt="DVAI Connect" className="h-7" />
                </a>
            </header>

            <main className="max-w-3xl mx-auto px-6 pb-24">
                <h1 className="text-3xl font-semibold mb-2">Billing</h1>
                <p className="text-sm text-[#c0c7d5] mb-8">
                    Manage your plan, payment method, and invoices.
                </p>

                <section className="rounded-2xl bg-[rgba(30,40,50,0.5)] backdrop-blur-xl border border-white/5 p-6 mb-6">
                    <div className="flex flex-wrap items-baseline gap-3 mb-4">
                        <p className="text-xs font-semibold tracking-widest text-emerald-300 uppercase">
                            Current plan
                        </p>
                        <h2 className="text-2xl font-bold capitalize">
                            {(status.tier ?? 'free').replace('_', ' ')}
                        </h2>
                        {sub && <StatusBadge status={sub.status} />}
                    </div>

                    {isFree && (
                        <>
                            <p className="text-sm text-[#c0c7d5] mb-6">
                                You're on the Free plan — 40-minute meetings, up to 10 participants,
                                no cloud recording. Upgrade to unlock longer meetings, recording,
                                and meeting agents.
                            </p>
                            <a
                                href="/pricing"
                                className="inline-block rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-5 py-2.5 text-sm"
                            >
                                See plans
                            </a>
                        </>
                    )}

                    {sub && (
                        <>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm mb-6">
                                <Row
                                    label="Next bill on"
                                    value={formatDate(sub.currentPeriodEnd)}
                                />
                                {sub.cancelAtPeriodEnd && (
                                    <Row
                                        label="Cancellation"
                                        value={
                                            <span className="text-amber-300">
                                                Cancels at period end
                                            </span>
                                        }
                                    />
                                )}
                                {sub.isAfricaCohort && sub.africaCommitmentEnd && (
                                    <Row
                                        label="Commitment ends"
                                        value={formatDate(sub.africaCommitmentEnd)}
                                    />
                                )}
                            </dl>

                            {sub.isAfricaCohort && (
                                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-100 mb-6">
                                    <strong className="font-semibold">Africa Cohort:</strong>{' '}
                                    Cancellation requires coordination with your cohort
                                    administrator while the commitment is active. After the
                                    commitment ends, you can manage the subscription normally from
                                    the portal.
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={openPortal}
                                disabled={portalBusy}
                                className="rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold px-5 py-2.5 text-sm"
                            >
                                {portalBusy ? 'Opening…' : 'Manage subscription'}
                            </button>
                            {portalError && (
                                <div className="mt-3 text-xs text-red-400">{portalError}</div>
                            )}
                        </>
                    )}
                </section>

                {status.warning && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-100">
                        {status.warning}
                    </div>
                )}

                <p className="mt-8 text-xs text-[#c0c7d5] text-center">
                    Need help with billing?{' '}
                    <a
                        href="mailto:billing@deepvoiceai.co"
                        className="underline decoration-dotted underline-offset-4 hover:text-emerald-300"
                    >
                        billing@deepvoiceai.co
                    </a>
                </p>
            </main>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-[#c0c7d5]">{label}</dt>
            <dd className="font-medium mt-0.5">{value}</dd>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const tone: Record<string, string> = {
        active: 'bg-emerald-500/20 text-emerald-300',
        trialing: 'bg-blue-500/20 text-blue-300',
        past_due: 'bg-amber-500/20 text-amber-200',
        canceled: 'bg-slate-500/20 text-slate-300',
        incomplete: 'bg-amber-500/20 text-amber-200',
        unpaid: 'bg-red-500/20 text-red-300',
    };
    return (
        <span
            className={
                'inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                (tone[status] ?? 'bg-slate-500/20 text-slate-300')
            }
        >
            {status}
        </span>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        });
    } catch {
        return iso;
    }
}
