import type { Metadata } from 'next';
import { TIERS } from '@/lib/pricing/tiers';

export const metadata: Metadata = {
    title: 'Pro (Africa Cohort) — DVAI Connect',
    description:
        'A partner program tier for Africa-based cohorts. Cohort-restricted; access via cohort admin invitation.',
};

/**
 * Info page for the Pro (Africa Cohort) tier.
 *
 * Intentionally does NOT contain a self-serve signup CTA — the tier is
 * gated by a signup code distributed by program administrators to
 * vetted cohort members. The signup form lives at /signup?code=…
 * (cohort admins share that URL directly).
 *
 * Page is public + indexable so a participant who lands here without a
 * code understands what the tier is and how to obtain access.
 */
export default function AfricaPricingPage() {
    const tier = TIERS.pro_africa;
    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] h-full overflow-y-auto text-slate-900 dark:text-slate-100 font-['Inter',sans-serif] antialiased">
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

            <section className="max-w-3xl mx-auto px-6 pt-8 pb-12">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300 uppercase mb-4">
                    Cohort program
                </p>
                <h1 className="text-4xl md:text-5xl font-semibold leading-tight mb-6">
                    {tier.displayName}
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">
                    A partner program tier for cohort members in Africa-based accelerators: SAV,
                    BAM, PAIN, and TEF.
                </p>
                <p className="text-3xl font-semibold mt-8 mb-1">
                    ${tier.basePriceUsd.toFixed(2)}{' '}
                    <span className="text-base font-normal opacity-70">/ member / month</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    24-month minimum commitment. End-to-end encryption included on every call.
                </p>

                <ul className="mt-8 space-y-3 text-sm">
                    <Li>1-hour meetings, up to 100 participants</Li>
                    <Li>Cloud recording (server-side encrypted at rest)</Li>
                    <Li>Meeting agent + on-device notetaking</Li>
                    <Li className="font-semibold">End-to-end encryption on every call</Li>
                    <Li>Community support</Li>
                </ul>

                <div className="mt-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-5 py-4 text-sm">
                    <strong className="font-semibold">How to sign up:</strong> Your cohort
                    administrator will share a personalized invite URL with you that contains a
                    signup code. Use that link to create your account. This tier is not self-serve
                    from the public pricing page — invites are issued by program administrators
                    only.
                </div>

                <div className="mt-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
                    <strong className="font-semibold">About the 24-month commitment:</strong> Pro
                    (Africa Cohort) subscriptions are wrapped in a Stripe Subscription Schedule for
                    the first 24 months. Cancellation during this period requires direct
                    coordination with the program administrator. After the 24th month the
                    subscription releases to standard month-to-month billing and customers may
                    cancel via the Customer Portal at any time.
                </div>

                <p className="mt-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    Not part of a cohort?{' '}
                    <a
                        href="/pricing"
                        className="underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                        See standard pricing →
                    </a>
                </p>
            </section>
        </div>
    );
}

function Li({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <li className={'flex items-start gap-2 ' + className}>
            <span className="text-emerald-500 mt-0.5">✓</span>
            <span>{children}</span>
        </li>
    );
}
