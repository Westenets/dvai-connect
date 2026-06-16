'use client';
import React, { useEffect, useState } from 'react';
import { account } from '@/lib/appwrite';
import { useAuth } from './AuthProvider';

/**
 * Top-of-page banner shown when the signed-in user's email isn't
 * verified yet. One-click sends a fresh Appwrite verification email
 * pointing at /verify-email.
 *
 * Dismissible per-session via sessionStorage so we don't nag during
 * a single tab session.
 */
export function VerifyEmailBanner() {
    const { user } = useAuth();
    const [hidden, setHidden] = useState(true);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setHidden(true);
            return;
        }
        if (user.emailVerification) {
            setHidden(true);
            return;
        }
        if (
            typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem('dvai.hideVerifyBanner') === '1'
        ) {
            setHidden(true);
            return;
        }
        setHidden(false);
    }, [user]);

    if (hidden) return null;

    const send = async () => {
        setSending(true);
        setError(null);
        try {
            const base =
                typeof window !== 'undefined'
                    ? window.location.origin
                    : 'https://connect.deepvoiceai.co';
            await account.createVerification(`${base}/verify-email`);
            setSent(true);
        } catch (err: any) {
            setError(err?.message ?? 'Send failed');
        } finally {
            setSending(false);
        }
    };

    const dismiss = () => {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('dvai.hideVerifyBanner', '1');
        }
        setHidden(true);
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-slate-900 text-sm flex items-center justify-center gap-3 px-4 py-2 shadow-md">
            <span className="font-semibold">Verify your email</span>
            <span className="hidden sm:inline opacity-80">
                We'll send a verification link to <strong>{user?.email}</strong>.
            </span>
            {sent ? (
                <span className="font-semibold">Sent — check your inbox.</span>
            ) : (
                <button
                    type="button"
                    onClick={send}
                    disabled={sending}
                    className="rounded-full bg-slate-900 text-amber-300 px-3 py-1 font-semibold text-xs disabled:opacity-50"
                >
                    {sending ? 'Sending…' : 'Send verification email'}
                </button>
            )}
            {error && <span className="text-xs text-red-700">{error}</span>}
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="ml-2 text-slate-900/70 hover:text-slate-900"
            >
                ×
            </button>
        </div>
    );
}
