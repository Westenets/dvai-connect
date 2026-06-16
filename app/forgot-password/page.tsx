'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { account } from '@/lib/appwrite';

/**
 * /forgot-password — request a password reset link via Appwrite's
 * built-in account.createRecovery flow. Appwrite emails the user a
 * link to /reset-password?userId=...&secret=... which we render.
 *
 * Anti-enumeration: the success message is the same whether the email
 * is registered or not. Appwrite still throws for malformed emails or
 * rate-limit hits — those bubble up.
 */
export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ForgotInner />
        </Suspense>
    );
}

function ForgotInner() {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const base =
                typeof window !== 'undefined'
                    ? window.location.origin
                    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://connect.deepvoiceai.co');
            await account.createRecovery(email.trim(), `${base}/reset-password`);
            setDone(true);
        } catch (err: any) {
            const msg = err?.message ?? 'Recovery email could not be sent';
            // Don't leak whether the email exists — generic message
            // even on user_not_found.
            if (/user.*not.*found|invalid_credentials/i.test(msg)) {
                setDone(true);
            } else {
                setError(msg);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] h-full overflow-y-auto text-slate-900 dark:text-slate-100 font-['Inter',sans-serif] antialiased flex flex-col">
            <header className="px-6 py-6">
                <Link href="/" className="inline-flex items-center gap-2">
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
                </Link>
            </header>
            <main className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
                    <h1 className="text-2xl font-semibold mb-2">Reset your password</h1>
                    {!done ? (
                        <>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                Enter the email you signed up with. We'll send you a link to set a
                                new password.
                            </p>
                            <form onSubmit={submit} className="space-y-4">
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                                {error && (
                                    <div className="text-sm text-red-600 dark:text-red-400">
                                        {error}
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 text-sm"
                                >
                                    {busy ? 'Sending…' : 'Send reset link'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            If an account with that email exists, we just sent a reset link. Check
                            your inbox (and spam folder). The link expires in 1 hour.
                        </p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-6">
                        Remembered it?{' '}
                        <Link
                            href="/login"
                            className="underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                            Back to sign in
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
