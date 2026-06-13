'use client';
import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { account } from '@/lib/appwrite';
import { ID, AppwriteException } from 'appwrite';
import { useAuth } from '@/components/AuthProvider';
import { CheckoutDrawer } from '@/lib/components/CheckoutDrawer';

/**
 * /signup — code-aware signup flow.
 *
 * Behavior:
 *   - With ?code=… (cohort signup, e.g. Pro Africa): validates code
 *     pre-flight via /api/signup/validate-code, displays the cohort
 *     program name + commitment terms, requires the user to agree to
 *     the commitment, then creates the Appwrite account and opens
 *     embedded Stripe Checkout for the cohort-restricted tier.
 *   - Without ?code= : redirects to /login (which has the standard
 *     register flow).
 */
export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupInner />
        </Suspense>
    );
}

function SignupInner() {
    const router = useRouter();
    const search = useSearchParams();
    const code = search.get('code')?.trim() ?? '';
    const { user, checkSession } = useAuth();

    const [validation, setValidation] = useState<
        | { state: 'loading' }
        | { state: 'invalid' }
        | { state: 'valid'; programName: string; tier: string; commitmentMonths: number | null; seatsRemaining: number | null }
        | { state: 'no-code' }
    >({ state: 'loading' });

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [agree, setAgree] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);

    useEffect(() => {
        if (!code) {
            // Standard signup belongs in /login. Redirect.
            router.replace('/login');
            setValidation({ state: 'no-code' });
            return;
        }
        let cancelled = false;
        fetch(`/api/signup/validate-code?code=${encodeURIComponent(code)}`)
            .then((res) => res.json())
            .then((body) => {
                if (cancelled) return;
                if (body.valid) {
                    setValidation({
                        state: 'valid',
                        programName: body.programName,
                        tier: body.tier,
                        commitmentMonths: body.commitmentMonths,
                        seatsRemaining: body.seatsRemaining,
                    });
                } else {
                    setValidation({ state: 'invalid' });
                }
            })
            .catch(() => {
                if (cancelled) return;
                setValidation({ state: 'invalid' });
            });
        return () => {
            cancelled = true;
        };
    }, [code, router]);

    // If already logged in, skip account creation and proceed straight
    // to checkout when the user clicks.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (validation.state !== 'valid') return;
        if (!agree) {
            setError('You must agree to the commitment to continue.');
            return;
        }
        setSubmitting(true);
        try {
            if (!user) {
                await account.create(ID.unique(), email, password, name || undefined);
                try {
                    await account.createEmailPasswordSession(email, password);
                } catch (err: any) {
                    if (
                        err instanceof AppwriteException &&
                        err.type === 'user_session_already_exists'
                    ) {
                        await account.deleteSession('current');
                        await account.createEmailPasswordSession(email, password);
                    } else throw err;
                }
                await checkSession();
            }
            setCheckoutOpen(true);
        } catch (err: any) {
            const msg =
                err instanceof AppwriteException
                    ? err.message
                    : err?.message ?? 'Signup failed';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (validation.state === 'loading' || validation.state === 'no-code') {
        return <CenteredMessage>Validating invitation…</CenteredMessage>;
    }
    if (validation.state === 'invalid') {
        return (
            <CenteredMessage>
                <h1 className="text-2xl font-semibold mb-3">
                    This invite link is no longer valid.
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                    Contact your cohort administrator for a fresh link, or{' '}
                    <a
                        href="/pricing"
                        className="underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                        see standard pricing
                    </a>
                    .
                </p>
            </CenteredMessage>
        );
    }

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen text-slate-900 dark:text-slate-100 font-['Inter',sans-serif] antialiased">
            <header className="px-6 py-6 max-w-6xl mx-auto">
                <a href="/" className="inline-flex items-center gap-2">
                    <img
                        src="/images/livekit-meet-home-light.svg"
                        alt="DVAI Connect"
                        className="h-8 block dark:hidden"
                    />
                    <img
                        src="/images/livekit-meet-home.svg"
                        alt="DVAI Connect"
                        className="h-8 hidden dark:block"
                    />
                </a>
            </header>

            <section className="max-w-md mx-auto px-6 pb-16">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300 uppercase mb-3">
                    {validation.programName} cohort signup
                </p>
                <h1 className="text-3xl font-semibold mb-2">Create your account</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    You're signing up via a {validation.programName} cohort invitation.{' '}
                    {validation.commitmentMonths
                        ? `Includes a ${validation.commitmentMonths}-month minimum commitment.`
                        : null}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="hidden" name="code" value={code} readOnly />
                    <div>
                        <label className="block text-sm mb-1">Full name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Work email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            required
                            disabled={!!user}
                        />
                    </div>
                    {!user && (
                        <div>
                            <label className="block text-sm mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                required
                                minLength={8}
                            />
                        </div>
                    )}
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={agree}
                            onChange={(e) => setAgree(e.target.checked)}
                            className="mt-1"
                        />
                        <span>
                            I understand and agree to the{' '}
                            {validation.commitmentMonths ?? 24}-month minimum
                            commitment. Cancellation during this period
                            requires coordination with my cohort administrator.
                        </span>
                    </label>
                    {error && (
                        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                    )}
                    <button
                        type="submit"
                        disabled={submitting || !agree}
                        className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold px-4 py-3 text-sm"
                    >
                        {submitting ? 'Working…' : user ? 'Continue to payment' : 'Create account and continue'}
                    </button>
                </form>

                {validation.seatsRemaining !== null && (
                    <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                        {validation.seatsRemaining} seats remaining in this cohort.
                    </p>
                )}
            </section>

            <CheckoutDrawer
                open={checkoutOpen}
                tier="pro_africa"
                signupCode={code}
                onClose={() => setCheckoutOpen(false)}
            />
        </div>
    );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">{children}</div>
        </div>
    );
}
