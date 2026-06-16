'use client';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { account } from '@/lib/appwrite';

/**
 * /verify-email?userId=X&secret=Y — completes the email verification
 * flow Appwrite started via account.createVerification. We just hand
 * the token back to updateVerification on mount.
 *
 * Users land here from clicking the link in the verification email
 * Appwrite sends. The page is intentionally minimal — its only job
 * is to call the API and report success/failure.
 */
export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <VerifyInner />
        </Suspense>
    );
}

function VerifyInner() {
    const search = useSearchParams();
    const userId = search.get('userId') ?? '';
    const secret = search.get('secret') ?? '';
    const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');
    const [message, setMessage] = useState<string>('Verifying…');

    useEffect(() => {
        if (!userId || !secret) {
            setState('fail');
            setMessage('Verification link is missing required parameters.');
            return;
        }
        account
            .updateVerification(userId, secret)
            .then(() => {
                setState('ok');
                setMessage('Your email is verified. You can close this tab.');
            })
            .catch((err: any) => {
                setState('fail');
                const msg = err?.message ?? 'Verification failed';
                setMessage(
                    /expired|invalid/i.test(msg)
                        ? 'This verification link has expired or already been used.'
                        : msg,
                );
            });
    }, [userId, secret]);

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
                <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center">
                    <div className="mb-4 flex justify-center">
                        {state === 'pending' ? (
                            <div className="w-10 h-10 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                        ) : state === 'ok' ? (
                            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-900 text-xl font-bold">
                                ✓
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white text-xl font-bold">
                                !
                            </div>
                        )}
                    </div>
                    <h1 className="text-xl font-semibold mb-3">
                        {state === 'pending'
                            ? 'Verifying email…'
                            : state === 'ok'
                              ? 'Email verified'
                              : 'Verification failed'}
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
                    {state !== 'pending' && (
                        <div className="mt-6">
                            <Link
                                href="/"
                                className="inline-block rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-5 py-2.5 text-sm"
                            >
                                Go home
                            </Link>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
