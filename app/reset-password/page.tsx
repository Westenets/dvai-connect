'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { account } from '@/lib/appwrite';

/**
 * /reset-password?userId=X&secret=Y — accept a new password.
 *
 * Appwrite's createRecovery email contains those two query params.
 * We hand them to updateRecovery along with the new password to
 * complete the reset.
 */
export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetInner />
        </Suspense>
    );
}

function ResetInner() {
    const router = useRouter();
    const search = useSearchParams();
    const userId = search.get('userId') ?? '';
    const secret = search.get('secret') ?? '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const valid = userId && secret;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setError(null);
        setBusy(true);
        try {
            await account.updateRecovery(userId, secret, password);
            setDone(true);
            setTimeout(() => router.push('/login'), 2000);
        } catch (err: any) {
            setError(err?.message ?? 'Reset failed');
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
                    <h1 className="text-2xl font-semibold mb-6">Set a new password</h1>
                    {!valid && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                            This link is missing required parameters. Request a fresh reset link
                            from{' '}
                            <Link href="/forgot-password" className="underline">
                                forgot password
                            </Link>
                            .
                        </p>
                    )}
                    {valid && done && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            Password updated. Redirecting to sign in…
                        </p>
                    )}
                    {valid && !done && (
                        <form onSubmit={submit} className="space-y-4">
                            <label className="block">
                                <span className="text-sm">New password</span>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm">Confirm password</span>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm"
                                />
                            </label>
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
                                {busy ? 'Updating…' : 'Update password'}
                            </button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
