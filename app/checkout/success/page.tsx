'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/**
 * /checkout/success?session_id=cs_test_…
 *
 * Stripe Embedded Checkout redirects here after a successful payment.
 * We:
 *   1. Verify the session with Stripe (server-side via /api/checkout/verify).
 *   2. Wait until our webhook-event processor has mirrored the
 *      subscription into Appwrite (so /admin and the in-app tier
 *      gates see the new tier immediately).
 *   3. Bounce to /settings (paid customers get the Customer Portal +
 *      subscription status there) once ready.
 *
 * If the wait exceeds POLL_TIMEOUT_MS we show a "still processing"
 * message and let the user navigate away — the webhook will eventually
 * apply the change and their next page refresh will see it.
 */
export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={null}>
            <CheckoutSuccessInner />
        </Suspense>
    );
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;

function CheckoutSuccessInner() {
    const router = useRouter();
    const search = useSearchParams();
    const sessionId = search.get('session_id') ?? '';
    const { checkSession } = useAuth();

    const [status, setStatus] = useState<'pending' | 'ready' | 'failed' | 'timeout'>('pending');
    const [message, setMessage] = useState<string>('Confirming your subscription…');
    const [tier, setTier] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setStatus('failed');
            setMessage('Missing session_id in URL — return to /pricing to start over.');
            return;
        }
        const startedAt = Date.now();
        let cancelled = false;

        const tick = async () => {
            if (cancelled) return;
            try {
                const res = await fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
                const body = (await res.json()) as { status: string; tier?: string; message?: string };
                if (cancelled) return;
                if (body.status === 'ready') {
                    setStatus('ready');
                    setTier(body.tier ?? null);
                    setMessage('Subscription active.');
                    await checkSession();
                    setTimeout(() => {
                        if (!cancelled) router.push('/billing');
                    }, 1200);
                    return;
                }
                if (body.status === 'failed') {
                    setStatus('failed');
                    setMessage(body.message ?? 'Verification failed');
                    return;
                }
                // pending
                setMessage(body.message ?? 'Waiting on Stripe webhook…');
                if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                    setStatus('timeout');
                    setMessage(
                        'Stripe confirmed your payment, but our system is still finalizing it. ' +
                            'You can leave this page — the change will land within a minute.',
                    );
                    return;
                }
                setTimeout(tick, POLL_INTERVAL_MS);
            } catch (err: any) {
                if (cancelled) return;
                setStatus('failed');
                setMessage(err?.message ?? 'Network error during verification');
            }
        };
        tick();

        return () => {
            cancelled = true;
        };
    }, [sessionId, router, checkSession]);

    return (
        <div className="bg-[#080c11] text-[#f1f3f4] font-['Inter',sans-serif] h-full overflow-y-auto antialiased flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl bg-[rgba(30,40,50,0.5)] backdrop-blur-xl border border-white/5 p-8 text-center">
                <div className="mb-6 flex justify-center">
                    {status === 'ready' ? <CheckBadge /> : status === 'failed' ? <ErrorBadge /> : <SpinnerBadge />}
                </div>
                <h1 className="text-2xl font-semibold mb-3">
                    {status === 'ready'
                        ? 'You’re all set'
                        : status === 'failed'
                            ? 'Something went wrong'
                            : status === 'timeout'
                                ? 'Almost there'
                                : 'Activating your plan'}
                </h1>
                <p className="text-sm text-[#c0c7d5] leading-relaxed mb-6">{message}</p>
                {tier && (
                    <p className="text-xs text-emerald-300 font-semibold tracking-widest uppercase mb-6">
                        Plan: {tier.replace('_', ' ')}
                    </p>
                )}
                <div className="flex justify-center gap-3">
                    <a
                        href="/billing"
                        className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-5 py-2.5 text-sm"
                    >
                        Open billing
                    </a>
                    <a
                        href="/"
                        className="rounded-full border border-white/10 text-white px-5 py-2.5 text-sm hover:bg-white/5"
                    >
                        Go to dashboard
                    </a>
                </div>
            </div>
        </div>
    );
}

function SpinnerBadge() {
    return (
        <div className="w-12 h-12 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
    );
}
function CheckBadge() {
    return (
        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-slate-900 text-2xl font-bold">
            ✓
        </div>
    );
}
function ErrorBadge() {
    return (
        <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white text-2xl font-bold">
            !
        </div>
    );
}
