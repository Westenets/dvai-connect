import type { Metadata } from 'next';
import { TIERS, VISIBLE_PUBLIC_TIER_IDS, type TierId } from '@/lib/pricing/tiers';
import { PricingCtaButton } from '@/lib/components/PricingCtaButton';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = {
    title: 'Pricing — DVAI Connect',
    description:
        'End-to-end encryption on every plan, including Free. We cannot see what is said in your meetings. Plans from $0 to enterprise.',
};

/**
 * Public pricing page — server component.
 *
 * Reads tier definitions from lib/pricing/tiers.ts. Pro (Africa
 * Cohort) is intentionally NOT listed; it's reached only via
 * /pricing/africa with a valid cohort signup code.
 *
 * E2EE row is repeated on every tier as the structural moat. Recording
 * row is preceded by the server-side encryption disclosure (cloud
 * recording is NOT end-to-end encrypted — only client-side meetings
 * are E2EE).
 */
export default async function PricingPage() {
    const user = await getCurrentUser();
    const userIsAuthenticated = !!user;

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

            <section className="max-w-4xl mx-auto px-6 pt-8 pb-16 text-center">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300 uppercase mb-4">
                    Privacy by design
                </p>
                <h1 className="text-4xl md:text-6xl font-semibold leading-tight mb-6">
                    We cannot see what is said in your meetings.
                </h1>
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                    End-to-end encryption on every plan, including Free. On-device AI for
                    transcription and assistance. No cloud STT, no copy of your audio.
                </p>
            </section>

            <section className="max-w-6xl mx-auto px-6 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                        <TierCard
                            key={id}
                            id={id}
                            userIsAuthenticated={userIsAuthenticated}
                        />
                    ))}
                </div>

                <DisclosureBanner />
                <FeatureMatrix />
                <Faq />

                <div className="mt-16 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        Part of a partner program in Africa?{' '}
                        <a
                            href="/pricing/africa"
                            className="underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                            See Pro (Africa Cohort) pricing →
                        </a>
                    </p>
                </div>
            </section>
        </div>
    );
}

function TierCard({ id, userIsAuthenticated }: { id: TierId; userIsAuthenticated: boolean }) {
    const tier = TIERS[id];
    const isFree = id === 'free';
    const isEnterprise = id === 'enterprise';
    const isFeatured = id === 'pro';
    return (
        <div
            className={
                'rounded-2xl p-6 flex flex-col gap-4 ' +
                (isFeatured
                    ? 'bg-slate-900 dark:bg-slate-800 text-white ring-2 ring-emerald-500/40 shadow-xl'
                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ring-1 ring-slate-200 dark:ring-slate-700')
            }
        >
            {isFeatured && (
                <span className="self-start text-[11px] font-semibold tracking-widest uppercase text-emerald-400">
                    Most popular
                </span>
            )}
            <h3 className="text-xl font-semibold">{tier.displayName}</h3>
            <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold">
                    ${tier.basePriceUsd === 0 ? '0' : tier.basePriceUsd.toFixed(2)}
                </span>
                {!isFree && (
                    <span className="text-sm opacity-70">
                        /mo {isEnterprise ? '(annual)' : ''}
                    </span>
                )}
            </div>
            <ul className="text-sm space-y-2 mt-2">
                <Li>
                    {tier.meetingMaxMinutes >= 60
                        ? `${tier.meetingMaxMinutes / 60}-hour meetings`
                        : `${tier.meetingMaxMinutes}-minute meetings`}
                </Li>
                <Li>Up to {tier.attendeeCap.toLocaleString()} participants</Li>
                <Li>{tier.cloudRecording ? 'Cloud recording' : 'No cloud recording'}</Li>
                <Li>
                    {tier.meetingAgentQuota >= 1
                        ? `${tier.meetingAgentQuota} meeting agent${tier.meetingAgentQuota > 1 ? 's' : ''}`
                        : 'No meeting agent'}
                </Li>
                <Li className="font-semibold">End-to-end encryption</Li>
                {tier.customBranding && <Li>Custom branding</Li>}
                {tier.adminDashboard && <Li>Admin dashboard</Li>}
                {tier.dedicatedNode && <Li>Dedicated LiveKit infrastructure</Li>}
                <Li>{tier.support === '24-7' ? '24/7 support' : 'Community support'}</Li>
            </ul>
            <div className="mt-auto pt-4">
                {isFree ? (
                    <a
                        href="/login"
                        className={
                            'block text-center rounded-lg px-4 py-3 text-sm font-semibold ' +
                            'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 ' +
                            'text-slate-900 dark:text-white'
                        }
                    >
                        Get started for free
                    </a>
                ) : (
                    <PricingCtaButton
                        tier={id as Exclude<TierId, 'free'>}
                        label={isEnterprise ? 'Contact sales' : 'Subscribe'}
                        contactSales={isEnterprise}
                        userIsAuthenticated={userIsAuthenticated}
                        className={
                            'block w-full text-center rounded-lg px-4 py-3 text-sm font-semibold ' +
                            (isFeatured
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
                                : 'bg-slate-900 hover:bg-slate-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-900')
                        }
                    />
                )}
            </div>
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

function DisclosureBanner() {
    return (
        <div className="mt-16 mb-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
            <strong className="font-semibold">A note on recording:</strong>{' '}
            Cloud recording uses server-side encryption (not end-to-end). To
            generate a recordable file, the meeting's media keys are released
            to a server-side recording worker that we control. The live
            meeting itself remains E2EE between participants. If end-to-end
            confidentiality is non-negotiable for a particular session, do
            not enable cloud recording for that session.
        </div>
    );
}

function FeatureMatrix() {
    const rows: Array<{ label: string; get: (t: TierId) => string }> = [
        {
            label: 'Meeting length',
            get: (t) => `${TIERS[t].meetingMaxMinutes} min`,
        },
        {
            label: 'Attendee cap',
            get: (t) => TIERS[t].attendeeCap.toLocaleString(),
        },
        {
            label: 'Cloud recording',
            get: (t) => (TIERS[t].cloudRecording ? '✓' : '—'),
        },
        {
            label: 'Meeting agent',
            get: (t) => (TIERS[t].meetingAgentQuota > 0 ? `${TIERS[t].meetingAgentQuota}` : '—'),
        },
        {
            label: 'Notetaking',
            get: (t) => (TIERS[t].notetaking ? '✓' : '—'),
        },
        {
            label: 'Custom branding',
            get: (t) => (TIERS[t].customBranding ? '✓' : '—'),
        },
        {
            label: 'Admin dashboard',
            get: (t) => (TIERS[t].adminDashboard ? '✓' : '—'),
        },
        {
            label: 'Dedicated infrastructure',
            get: (t) => (TIERS[t].dedicatedNode ? '✓' : '—'),
        },
        {
            label: 'End-to-end encryption',
            get: () => '✓',
        },
        {
            label: 'Support',
            get: (t) => (TIERS[t].support === '24-7' ? '24/7' : 'Community'),
        },
    ];
    return (
        <div className="mt-12 overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-3 px-2 font-semibold">Compare features</th>
                        {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                            <th
                                key={id}
                                className="text-center py-3 px-2 font-semibold"
                            >
                                {TIERS[id].displayName}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.label}
                            className={
                                'border-b border-slate-100 dark:border-slate-800 ' +
                                (row.label === 'End-to-end encryption'
                                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 font-semibold'
                                    : '')
                            }
                        >
                            <td className="py-3 px-2 text-slate-700 dark:text-slate-300">
                                {row.label}
                            </td>
                            {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                                <td
                                    key={id}
                                    className="text-center py-3 px-2 text-slate-900 dark:text-slate-100"
                                >
                                    {row.get(id)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Faq() {
    const items: Array<{ q: string; a: string }> = [
        {
            q: 'How is E2EE possible if you also offer cloud recording?',
            a: 'The live meeting is end-to-end encrypted between participants. The cloud recording feature is opt-in per session — when enabled, the meeting media keys are released to a server-side recording worker we operate. The recording then sits in storage protected by server-side encryption. If end-to-end confidentiality is non-negotiable for a session, leave cloud recording off.',
        },
        {
            q: 'What does "dedicated LiveKit infrastructure" mean on Enterprise?',
            a: 'Each Enterprise customer runs against their own LiveKit server, recording workers, and storage bucket — not the shared multi-tenant cluster. Audio/video and recordings are physically isolated from other customers. Customers in regulated industries (healthcare, finance) typically need this.',
        },
        {
            q: 'What happens if a Business meeting goes over 60 minutes?',
            a: 'You get charged a small per-hour overage on the same invoice cycle. The current default rate is $35/hour; admins can adjust it via the admin panel. Meetings do not get cut off mid-call.',
        },
        {
            q: 'Is there a fee for very large Enterprise meetings?',
            a: 'Concurrent meetings of 1,000 or more attendees carry an additional per-session fee, also configurable by admins. Standard Enterprise meetings under that threshold are included in the $449.99/mo base.',
        },
        {
            q: 'I am part of an Africa partner program (SAV / BAM / PAIN / TEF). How do I get the Pro (Africa Cohort) tier?',
            a: 'Your cohort admin will share a personalized invite URL with a signup code. Use that URL to sign up — the Pro (Africa Cohort) tier is not self-serve from the public pricing page.',
        },
    ];
    return (
        <div className="mt-16 max-w-3xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6">Frequently asked questions</h2>
            <dl className="space-y-4">
                {items.map((item) => (
                    <div
                        key={item.q}
                        className="bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 rounded-xl p-5"
                    >
                        <dt className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            {item.q}
                        </dt>
                        <dd className="text-sm text-slate-700 dark:text-slate-300">
                            {item.a}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
