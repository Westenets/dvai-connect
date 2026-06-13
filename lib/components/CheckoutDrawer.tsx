'use client';
import { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import type { PaidTierId } from '@/lib/pricing/stripe-config';

/**
 * Embedded Stripe Checkout drawer.
 *
 * Lazy-loads the Stripe.js script the first time the drawer opens, then
 * fetches a Checkout Session client_secret from /api/checkout and mounts
 * the Stripe-hosted embedded UI inline.
 *
 * Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in the env. If missing,
 * renders a clear error instead of silently failing — easier to debug
 * than a blank modal.
 */

interface Props {
    open: boolean;
    tier: PaidTierId | null;
    signupCode?: string;
    quantity?: number;
    onClose: () => void;
}

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
    if (!stripePromise) {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!key) {
            return null;
        }
        stripePromise = loadStripe(key);
    }
    return stripePromise;
}

export function CheckoutDrawer({ open, tier, signupCode, quantity, onClose }: Props) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !tier) {
            setClientSecret(null);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier, signupCode, quantity }),
        })
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error ?? `HTTP ${res.status}`);
                }
                return res.json() as Promise<{ clientSecret: string }>;
            })
            .then((body) => {
                if (cancelled) return;
                setClientSecret(body.clientSecret);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e?.message ?? 'Failed to start checkout');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tier, signupCode, quantity]);

    if (!open) return null;

    const stripe = getStripe();

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Checkout"
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Checkout
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-2xl leading-none"
                        aria-label="Close checkout"
                    >
                        ×
                    </button>
                </div>
                <div className="p-2 min-h-[400px]">
                    {!stripe && (
                        <div className="p-6 text-sm text-red-600 dark:text-red-400">
                            Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — checkout disabled.
                        </div>
                    )}
                    {stripe && loading && !clientSecret && (
                        <div className="p-12 text-center text-sm text-slate-500">
                            Preparing checkout…
                        </div>
                    )}
                    {stripe && error && (
                        <div className="p-6 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}
                    {stripe && clientSecret && (
                        <EmbeddedCheckoutProvider
                            stripe={stripe}
                            options={{ clientSecret }}
                        >
                            <EmbeddedCheckout />
                        </EmbeddedCheckoutProvider>
                    )}
                </div>
            </div>
        </div>
    );
}
