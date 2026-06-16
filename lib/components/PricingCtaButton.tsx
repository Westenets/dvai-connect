'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaidTierId } from '@/lib/pricing/stripe-config';
import { CheckoutDrawer } from './CheckoutDrawer';

interface Props {
    tier: PaidTierId;
    label: string;
    /** Set true for sales-led tiers (Enterprise) — opens mailto instead
     *  of checkout. */
    contactSales?: boolean;
    /** When the user isn't logged in, the button redirects to /login
     *  first. Pass the desired path; defaults to current page. */
    loginReturnPath?: string;
    /** Set true if the caller has already verified the user is signed
     *  in. Skips the redirect-to-login dance. */
    userIsAuthenticated?: boolean;
    className?: string;
}

/**
 * Client-side CTA for the public /pricing page. Handles three cases:
 *   - sales-led tier (contactSales=true): opens mailto link
 *   - user signed in: opens CheckoutDrawer inline
 *   - user not signed in: redirects to /login?next=/pricing (the
 *     /pricing CTA re-engages after login)
 */
export function PricingCtaButton({
    tier,
    label,
    contactSales = false,
    loginReturnPath,
    userIsAuthenticated = false,
    className = '',
}: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    if (contactSales) {
        return (
            <a
                href="mailto:sales@deepvoiceai.co?subject=Enterprise%20inquiry%20%E2%80%94%20DVAI%20Connect"
                className={className}
            >
                {label}
            </a>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    if (!userIsAuthenticated) {
                        const next = loginReturnPath ?? '/pricing';
                        router.push(`/login?next=${encodeURIComponent(next)}`);
                        return;
                    }
                    setOpen(true);
                }}
                className={className}
            >
                {label}
            </button>
            <CheckoutDrawer open={open} tier={tier} onClose={() => setOpen(false)} />
        </>
    );
}
