import type { Metadata } from 'next';
import { TIERS, VISIBLE_PUBLIC_TIER_IDS, type TierId } from '@/lib/pricing/tiers';
import { PricingCtaButton } from '@/lib/components/PricingCtaButton';
import { getCurrentUser } from '@/lib/auth/session';
import { getAllOverrides, type TierOverride } from '@/lib/pricing/overrides';

export const metadata: Metadata = {
    title: 'Pricing — DVAI Connect',
    description:
        'End-to-end encryption on every plan, including Free. We cannot see what is said in your meetings. Plans from $0 to enterprise.',
};

/**
 * Public pricing page — server component.
 *
 * Adapted from the 2026-06-13 Stitch design (DVAIConnect / Pricing -
 * Desktop / Pricing - Mobile screens), with three intentional
 * deviations to match facts on the ground:
 *
 *   1. Color palette swapped from Stitch's primary blue (#258cf4) to
 *      our locked emerald accent. Background + surface colors are
 *      preserved as-is from the design.
 *   2. The "Signal Protocol" claim in the Stitch trust section was
 *      replaced with accurate language — we use the W3C WebRTC
 *      Encoded Transform with AES-GCM, not Signal Protocol.
 *   3. The three placeholder partner / compliance logos in the Stitch
 *      trust section were dropped (real partner logos require signed
 *      agreements; honest text reassurance for now).
 *
 * Pro (Africa Cohort) is intentionally NOT listed; reachable only via
 * /pricing/africa with a valid cohort signup code.
 */
export default async function PricingPage() {
    const [user, overrides] = await Promise.all([getCurrentUser(), getAllOverrides()]);
    const userIsAuthenticated = !!user;

    return (
        // h-full + overflow-y-auto override the global PageTransition
        // wrapper's overflow-hidden so the page actually scrolls.
        <div
            className="bg-[#080c11] text-[#f1f3f4] font-['Inter',sans-serif] h-full overflow-y-auto antialiased"
        >
            <TopNav />

            <main className="relative pt-32 pb-24 px-6 max-w-7xl mx-auto">
                {/* Background glow decoration */}
                <div className="absolute inset-x-0 top-0 h-full -z-10 opacity-20 pointer-events-none overflow-hidden">
                    <div className="absolute top-20 left-1/4 w-96 h-96 bg-emerald-500/30 blur-[120px] rounded-full" />
                    <div className="absolute bottom-40 right-1/4 w-96 h-96 bg-emerald-300/20 blur-[120px] rounded-full" />
                </div>

                {/* Hero */}
                <header className="text-center mb-20 space-y-6">
                    <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 font-bold tracking-widest text-xs uppercase">
                        Privacy by design
                    </span>
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight">
                        We cannot see what is said in your meetings.
                    </h1>
                    <p className="text-[#c0c7d5] text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                        End-to-end encryption on every plan, including Free. On-device AI for
                        transcription and assistance. No cloud STT, no copy of your audio.
                    </p>
                </header>

                {/* Pricing grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
                    {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                        <TierCard
                            key={id}
                            id={id}
                            userIsAuthenticated={userIsAuthenticated}
                            override={overrides.get(id)}
                        />
                    ))}
                </div>

                <DisclosureBanner />

                <FeatureMatrix />

                <TrustSection />

                <Faq />

                <div className="mt-16 text-center text-sm text-[#c0c7d5]">
                    Part of a partner program in Africa?{' '}
                    <a
                        href="/pricing/africa"
                        className="underline decoration-dotted underline-offset-4 text-emerald-300 hover:text-emerald-200"
                    >
                        See Pro (Africa Cohort) pricing →
                    </a>
                </div>
            </main>

            <Footer />
        </div>
    );
}

function TopNav() {
    return (
        <nav className="fixed top-0 left-0 right-0 z-40 flex justify-between items-center px-6 py-4 bg-[#101922]/90 backdrop-blur-xl border-b border-white/5">
            <a href="/" className="inline-flex items-center gap-2">
                <img
                    src="/images/livekit-meet-home.svg"
                    alt="DVAI Connect"
                    className="h-7"
                />
            </a>
            <div className="hidden md:flex gap-8 items-center text-sm">
                <a className="text-emerald-300 font-semibold border-b-2 border-emerald-400 pb-1" href="/pricing">
                    Pricing
                </a>
                <a className="text-[#c0c7d5] hover:text-white transition-colors font-medium" href="/">
                    Home
                </a>
                <a
                    className="text-[#c0c7d5] hover:text-white transition-colors font-medium"
                    href="/pricing/africa"
                >
                    Africa cohort
                </a>
            </div>
            <div className="flex items-center gap-3">
                <a
                    href="/login"
                    className="text-white hover:bg-white/5 transition px-4 py-2 text-sm font-medium rounded-full"
                >
                    Log in
                </a>
                <a
                    href="/login"
                    className="bg-emerald-500 text-slate-900 font-bold px-5 py-2.5 rounded-full hover:bg-emerald-400 active:scale-95 transition text-sm"
                >
                    Get started
                </a>
            </div>
        </nav>
    );
}

interface TierCopy {
    bullets: string[];
    /** Bullet rendered in the emphasized (security) row. */
    securityBullet: string;
    ctaLabel: string;
}

const TIER_COPY: Record<TierId, TierCopy> = {
    free: {
        bullets: ['40-minute meetings', 'Up to 10 participants', 'No cloud recording', 'No meeting agent'],
        securityBullet: 'End-to-end encryption',
        ctaLabel: 'Get started',
    },
    pro_africa: {
        // Listed for completeness even though hidden from this page.
        bullets: ['1-hour meetings', 'Up to 100 participants', 'Cloud recording', '1 meeting agent'],
        securityBullet: 'End-to-end encryption',
        ctaLabel: 'Subscribe',
    },
    pro: {
        bullets: ['1-hour meetings', 'Up to 100 participants', 'Cloud recording', '1 meeting agent'],
        securityBullet: 'End-to-end encryption',
        ctaLabel: 'Subscribe',
    },
    business: {
        bullets: ['1-hour meetings + hourly overage', 'Up to 300 participants', 'Cloud recording', '1 meeting agent'],
        securityBullet: 'Admin dashboard + custom branding',
        ctaLabel: 'Go Business',
    },
    enterprise: {
        bullets: ['3-hour meetings', 'Up to 1,000 participants', 'Dedicated LiveKit node', 'Custom branding + admin dash'],
        securityBullet: '24/7 support + partitioned data',
        ctaLabel: 'Contact sales',
    },
};

function TierCard({
    id,
    userIsAuthenticated,
    override,
}: {
    id: TierId;
    userIsAuthenticated: boolean;
    override?: TierOverride;
}) {
    const tier = TIERS[id];
    const copy = TIER_COPY[id];
    const isFree = id === 'free';
    const isEnterprise = id === 'enterprise';
    const isFeatured = id === 'pro';
    const effectiveDisplayName = override?.displayName ?? tier.displayName;
    const effectiveBadge = override?.badge ?? (isFeatured ? 'Most popular' : undefined);
    const effectiveBullets = override?.bullets && override.bullets.length > 0
        ? override.bullets
        : copy.bullets;

    return (
        <div
            className={[
                'relative rounded-2xl p-8 flex flex-col transition-all duration-300',
                'bg-[rgba(30,40,50,0.4)] backdrop-blur-xl border',
                isFeatured
                    ? 'border-emerald-400/50 shadow-[0_0_40px_-12px_rgba(52,211,153,0.4)] md:-translate-y-1'
                    : 'border-white/5 hover:bg-[rgba(35,46,58,0.6)] hover:border-white/10',
            ].join(' ')}
        >
            {effectiveBadge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-900 px-4 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full">
                    {effectiveBadge}
                </div>
            )}

            <div className="mb-8">
                <h3 className="font-bold text-xl mb-6">{effectiveDisplayName}</h3>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">
                        ${tier.basePriceUsd === 0 ? '0' : tier.basePriceUsd.toFixed(2)}
                    </span>
                    {!isFree && <span className="text-[#c0c7d5] text-sm">/mo</span>}
                </div>
                {isEnterprise && (
                    <span className="text-[10px] text-[#c0c7d5] italic">(billed annually)</span>
                )}
            </div>

            {override?.headlineCopy && (
                <p className="text-sm text-[#c0c7d5] mb-4">{override.headlineCopy}</p>
            )}

            <ul className="space-y-3.5 mb-10 flex-grow text-sm">
                {effectiveBullets.map((b) => (
                    <Bullet key={b}>{b}</Bullet>
                ))}
                {!override?.bullets && (
                    <>
                        <BulletEmphasized>{copy.securityBullet}</BulletEmphasized>
                        <Bullet>{tier.support === '24-7' ? '24/7 priority support' : 'Community support'}</Bullet>
                    </>
                )}
            </ul>

            {isFree ? (
                <a
                    href="/login"
                    className="block text-center w-full py-4 rounded-full bg-white text-slate-900 font-bold hover:bg-slate-100 transition active:scale-95"
                >
                    {copy.ctaLabel}
                </a>
            ) : (
                <PricingCtaButton
                    tier={id as Exclude<TierId, 'free'>}
                    label={copy.ctaLabel}
                    contactSales={isEnterprise}
                    userIsAuthenticated={userIsAuthenticated}
                    className={[
                        'block w-full text-center py-4 rounded-full font-bold transition active:scale-95',
                        isFeatured
                            ? 'bg-emerald-500 text-slate-900 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                            : 'bg-white text-slate-900 hover:bg-slate-100',
                    ].join(' ')}
                />
            )}
        </div>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3 text-[#c0c7d5]">
            <CheckIcon className="text-emerald-400 mt-0.5 shrink-0" />
            <span>{children}</span>
        </li>
    );
}

function BulletEmphasized({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3 font-semibold text-white">
            <ShieldIcon className="text-emerald-400 mt-0.5 shrink-0" />
            <span>{children}</span>
        </li>
    );
}

function CheckIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            className={`w-4 h-4 ${className}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
        >
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ShieldIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            className={`w-4 h-4 ${className}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 2 L21 6 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V6 Z" />
        </svg>
    );
}

function DisclosureBanner() {
    return (
        <div className="mt-16 mb-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-6 py-5 text-sm text-amber-100 max-w-4xl mx-auto">
            <strong className="font-semibold text-amber-50">A note on recording:</strong>{' '}
            Cloud recording uses server-side encryption (not end-to-end). To generate a
            recordable file, the meeting's media keys are released to a server-side recording
            worker that we control. The live meeting itself remains E2EE between
            participants. If end-to-end confidentiality is non-negotiable for a particular
            session, do not enable cloud recording for that session.
        </div>
    );
}

function FeatureMatrix() {
    const rows: Array<{ label: string; get: (t: TierId) => string }> = [
        { label: 'Meeting length', get: (t) => `${TIERS[t].meetingMaxMinutes} min` },
        { label: 'Attendee cap', get: (t) => TIERS[t].attendeeCap.toLocaleString() },
        { label: 'Cloud recording', get: (t) => (TIERS[t].cloudRecording ? '✓' : '—') },
        { label: 'Meeting agent', get: (t) => (TIERS[t].meetingAgentQuota > 0 ? `${TIERS[t].meetingAgentQuota}` : '—') },
        { label: 'Notetaking', get: (t) => (TIERS[t].notetaking ? '✓' : '—') },
        { label: 'Custom branding', get: (t) => (TIERS[t].customBranding ? '✓' : '—') },
        { label: 'Admin dashboard', get: (t) => (TIERS[t].adminDashboard ? '✓' : '—') },
        { label: 'Dedicated infrastructure', get: (t) => (TIERS[t].dedicatedNode ? '✓' : '—') },
        { label: 'End-to-end encryption', get: () => '✓' },
        { label: 'Support', get: (t) => (TIERS[t].support === '24-7' ? '24/7' : 'Community') },
    ];
    return (
        <section className="mt-20 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Full feature breakdown</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/5 bg-[rgba(30,40,50,0.4)] backdrop-blur-xl">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="text-left py-4 px-5 font-semibold text-[#c0c7d5]">Feature</th>
                            {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                                <th key={id} className="text-center py-4 px-3 font-semibold">
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
                                    'border-b border-white/5 last:border-0 ' +
                                    (row.label === 'End-to-end encryption'
                                        ? 'bg-emerald-500/5 font-semibold text-emerald-100'
                                        : '')
                                }
                            >
                                <td className="py-3 px-5 text-[#c0c7d5]">{row.label}</td>
                                {VISIBLE_PUBLIC_TIER_IDS.map((id) => (
                                    <td key={id} className="text-center py-3 px-3">
                                        {row.get(id)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function TrustSection() {
    return (
        <section className="mt-24 rounded-3xl bg-[rgba(30,40,50,0.4)] backdrop-blur-xl border border-white/5 p-12 text-center overflow-hidden relative">
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full" />
            <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold mb-4">Secured by what the web actually ships.</h2>
                <p className="text-[#c0c7d5] mb-10">
                    Media is end-to-end encrypted in the browser via the W3C{' '}
                    <a
                        href="https://www.w3.org/TR/webrtc-encoded-transform/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-4 text-emerald-300 hover:text-emerald-200"
                    >
                        WebRTC Encoded Transform
                    </a>
                    . Keys are negotiated client-side using AES-GCM and are never released to
                    our servers. The only exception is opt-in cloud recording, which is
                    clearly disclosed every time and uses server-side encryption at rest.
                </p>
                <div className="flex flex-wrap justify-center gap-6 text-sm text-[#c0c7d5]">
                    <Pillar label="Client-negotiated keys" />
                    <Pillar label="AES-GCM media frames" />
                    <Pillar label="Recording is opt-in and disclosed" />
                </div>
            </div>
        </section>
    );
}

function Pillar({ label }: { label: string }) {
    return (
        <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {label}
        </div>
    );
}

function Faq() {
    const items: Array<{ q: string; a: string }> = [
        {
            q: 'How is E2EE possible if you also offer cloud recording?',
            a: 'The live meeting is end-to-end encrypted between participants. Cloud recording is opt-in per session — when enabled, the meeting media keys are released to a server-side recording worker we operate. The recording then sits in storage protected by server-side encryption. If end-to-end confidentiality is non-negotiable for a session, leave cloud recording off.',
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
        <section className="mt-24 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Frequently asked questions</h2>
            <dl className="space-y-4">
                {items.map((item) => (
                    <div
                        key={item.q}
                        className="rounded-2xl border border-white/5 bg-[rgba(30,40,50,0.4)] backdrop-blur-xl p-6"
                    >
                        <dt className="font-semibold text-white mb-2">{item.q}</dt>
                        <dd className="text-sm text-[#c0c7d5] leading-relaxed">{item.a}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function Footer() {
    return (
        <footer className="w-full py-12 px-6 border-t border-white/5 bg-[#080c11]">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex flex-col items-center md:items-start gap-3">
                    <img
                        src="/images/livekit-meet-home.svg"
                        alt="DVAI Connect"
                        className="h-7"
                    />
                    <p className="text-xs text-[#c0c7d5]">
                        © {new Date().getFullYear()} Deep Voice AI Limited. Built for privacy.
                    </p>
                </div>
                <div className="flex flex-wrap gap-6 justify-center text-xs text-[#c0c7d5]">
                    <a href="/legal/privacy" className="hover:text-emerald-300 transition">Privacy Policy</a>
                    <a href="/legal/terms" className="hover:text-emerald-300 transition">Terms of Service</a>
                    <a href="/legal/security" className="hover:text-emerald-300 transition">Security</a>
                    <a href="https://status.deepvoiceai.co" className="hover:text-emerald-300 transition">Status</a>
                </div>
            </div>
        </footer>
    );
}
