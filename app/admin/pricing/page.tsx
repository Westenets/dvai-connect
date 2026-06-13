import { TIERS, type TierId } from '@/lib/pricing/tiers';
import {
    STRIPE_PRICE_ENV_BY_TIER,
    STRIPE_METERED_PRICE_ENV,
    STRIPE_METER_ENV,
} from '@/lib/pricing/stripe-config';
import { stripe, STRIPE_API_VERSION } from '@/lib/stripe';
import { getAllOverrides } from '@/lib/pricing/overrides';
import { CopyValue } from '../organizations/[id]/CopyValue';
import { TierOverridesEditor } from './TierOverridesEditor';

/**
 * Pricing admin (v1 — read-only config dashboard).
 *
 * Shows three things:
 *   1. Live tier definitions from lib/pricing/tiers.ts (the static
 *      source of truth read by the public /pricing page).
 *   2. The Stripe price IDs + meter IDs + portal config IDs that this
 *      deployment is currently using, with copy-to-clipboard buttons.
 *      Drift between the env IDs and the underlying Stripe objects
 *      (renamed product, deactivated price) is surfaced inline.
 *   3. Live Stripe-side rates pulled via the Stripe API for the two
 *      metered prices (Business hourly overage, Enterprise big-room).
 *
 * Editing tier display copy or rotating Stripe price IDs is
 * deliberately not in v1 — those changes need a new pricing_tiers
 * Appwrite collection (additive migration) and a confirm-flow that
 * walks an admin through Stripe-side implications. See task #11.
 */

export const dynamic = 'force-dynamic';

interface PriceProbe {
    envName: string;
    id: string | null;
    error?: string;
    unitAmount?: number | null;
    currency?: string;
    productName?: string;
    active?: boolean;
    recurring?: { interval?: string; usage_type?: string; meter?: string | null };
}

async function probePrice(envName: string): Promise<PriceProbe> {
    const id = process.env[envName] ?? null;
    const probe: PriceProbe = { envName, id };
    if (!id) {
        probe.error = 'Env var not set';
        return probe;
    }
    if (!stripe) {
        probe.error = 'STRIPE_RESTRICTED_KEY / STRIPE_SECRET_KEY not set';
        return probe;
    }
    try {
        const price = await stripe.prices.retrieve(id, { expand: ['product'] });
        probe.unitAmount = price.unit_amount;
        probe.currency = price.currency;
        probe.active = price.active;
        const product = price.product;
        probe.productName =
            typeof product === 'string'
                ? product
                : 'name' in product
                    ? product.name
                    : product.id;
        probe.recurring = price.recurring
            ? {
                interval: price.recurring.interval,
                usage_type: price.recurring.usage_type,
                meter: price.recurring.meter ?? null,
            }
            : undefined;
    } catch (err: any) {
        probe.error = err?.message ?? String(err);
    }
    return probe;
}

async function probeMeter(envName: string): Promise<{ envName: string; id: string | null; error?: string; displayName?: string; eventName?: string; status?: string }> {
    const id = process.env[envName] ?? null;
    if (!id) return { envName, id: null, error: 'Env var not set' };
    if (!stripe) return { envName, id, error: 'Stripe key not set' };
    try {
        const meter = await stripe.billing.meters.retrieve(id);
        return {
            envName,
            id,
            displayName: meter.display_name,
            eventName: meter.event_name,
            status: meter.status,
        };
    } catch (err: any) {
        return { envName, id, error: err?.message ?? String(err) };
    }
}

export default async function AdminPricingPage() {
    const [
        proAfricaPrice,
        proPrice,
        businessPrice,
        enterprisePrice,
        businessOverage,
        enterpriseBigRoom,
        meterBusiness,
        meterBigRoom,
        overrides,
    ] = await Promise.all([
        probePrice(STRIPE_PRICE_ENV_BY_TIER.pro_africa),
        probePrice(STRIPE_PRICE_ENV_BY_TIER.pro),
        probePrice(STRIPE_PRICE_ENV_BY_TIER.business),
        probePrice(STRIPE_PRICE_ENV_BY_TIER.enterprise),
        probePrice(STRIPE_METERED_PRICE_ENV.business_extra_hour),
        probePrice(STRIPE_METERED_PRICE_ENV.enterprise_big_room),
        probeMeter(STRIPE_METER_ENV.business_extra_hours),
        probeMeter(STRIPE_METER_ENV.concurrent_big_room),
        getAllOverrides(),
    ]);
    const overrideRows = (Object.values(TIERS) as Array<(typeof TIERS)[TierId]>).map((t) => {
        const o = overrides.get(t.id);
        return {
            tier: t.id,
            defaultDisplayName: t.displayName,
            defaultBadge: t.badge ?? '',
            displayName: o?.displayName,
            badge: o?.badge,
            description: o?.description,
            headlineCopy: o?.headlineCopy,
            bullets: o?.bullets,
        };
    });

    return (
        <div>
            <header className="mb-6">
                <h1 className="text-2xl font-semibold mb-1">Pricing</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Read-only view of the locked tier definitions plus the live
                    Stripe-side state for every price and meter this deployment
                    references.
                </p>
            </header>

            <Section title="Tier definitions">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Source: <code>lib/pricing/tiers.ts</code> (locked Tab 2). To
                    edit copy or feature flags, change the file and redeploy.
                    An editable override flow is tracked as a follow-up
                    (additive <code>pricing_tiers</code> collection).
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                            <tr>
                                <Th>Tier</Th>
                                <Th align="right">Price USD/mo</Th>
                                <Th align="right">Meeting min</Th>
                                <Th align="right">Attendees</Th>
                                <Th align="center">Recording</Th>
                                <Th align="center">Agent quota</Th>
                                <Th align="center">Custom branding</Th>
                                <Th align="center">Admin dash</Th>
                                <Th align="center">Dedicated node</Th>
                                <Th>Support</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(Object.values(TIERS) as Array<(typeof TIERS)[TierId]>).map((t) => (
                                <tr key={t.id}>
                                    <td className="px-4 py-2 font-semibold">{t.displayName}</td>
                                    <td className="px-4 py-2 text-right">${t.basePriceUsd}</td>
                                    <td className="px-4 py-2 text-right">{t.meetingMaxMinutes}</td>
                                    <td className="px-4 py-2 text-right">{t.attendeeCap}</td>
                                    <td className="px-4 py-2 text-center">{t.cloudRecording ? '✓' : '—'}</td>
                                    <td className="px-4 py-2 text-center">{t.meetingAgentQuota}</td>
                                    <td className="px-4 py-2 text-center">{t.customBranding ? '✓' : '—'}</td>
                                    <td className="px-4 py-2 text-center">{t.adminDashboard ? '✓' : '—'}</td>
                                    <td className="px-4 py-2 text-center">{t.dedicatedNode ? '✓' : '—'}</td>
                                    <td className="px-4 py-2 text-xs">{t.support}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="Display copy overrides">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Edit what users see on <code>/pricing</code> without
                    changing tier behavior. Pricing, caps, and feature flags
                    stay in <code>lib/pricing/tiers.ts</code> (the source of
                    truth for billing and gates). Empty fields revert to the
                    static default. Requires the <code>pricing_tiers</code>{' '}
                    collection — run{' '}
                    <code>scripts/appwrite-migrate-pricing-tiers-2026-06-14.mjs</code>{' '}
                    if you haven't yet.
                </p>
                <TierOverridesEditor initialRows={overrideRows} />
            </Section>

            <Section title="Stripe configuration">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Pinned to API version <code>{STRIPE_API_VERSION}</code>.
                    Edits to rate or product naming happen in the Stripe
                    Dashboard or via <code>scripts/stripe-setup-2026-06-13.mjs</code>.
                </p>
                <h3 className="font-semibold mb-2 mt-6">Base subscription prices</h3>
                <PriceList probes={[proAfricaPrice, proPrice, businessPrice, enterprisePrice]} />
                <h3 className="font-semibold mb-2 mt-8">Metered prices</h3>
                <PriceList probes={[businessOverage, enterpriseBigRoom]} />
                <h3 className="font-semibold mb-2 mt-8">Meters</h3>
                <MeterList probes={[meterBusiness, meterBigRoom]} />
                <h3 className="font-semibold mb-2 mt-8">Portal configurations</h3>
                <ul className="text-sm space-y-2">
                    <PortalConfigRow label="Default" envName="STRIPE_PORTAL_CONFIG_DEFAULT" />
                    <PortalConfigRow label="Africa cohort (locked: cancel + update disabled)" envName="STRIPE_PORTAL_CONFIG_AFRICA" />
                </ul>
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mb-10">
            <h2 className="text-lg font-semibold mb-3">{title}</h2>
            {children}
        </section>
    );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
    return (
        <th
            className={
                'px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap ' +
                (align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')
            }
        >
            {children}
        </th>
    );
}

function PriceList({ probes }: { probes: PriceProbe[] }) {
    return (
        <ul className="space-y-2">
            {probes.map((p) => (
                <li key={p.envName} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <code className="font-mono text-xs text-slate-500">{p.envName}</code>
                        {p.id && <CopyValue value={p.id} />}
                        {!p.id && <span className="text-xs text-red-500">unset</span>}
                    </div>
                    {p.error ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">{p.error}</p>
                    ) : (
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 space-y-1">
                            <div>
                                <strong className="text-slate-900 dark:text-slate-100">{p.productName ?? '—'}</strong>
                                {' · '}
                                {p.unitAmount != null ? `$${(p.unitAmount / 100).toFixed(2)}` : '—'}
                                {' '}
                                {p.currency?.toUpperCase()}
                                {p.recurring && ` / ${p.recurring.interval}`}
                                {p.recurring?.usage_type === 'metered' && ' · metered'}
                                {p.active === false && ' · ⚠ inactive'}
                            </div>
                            {p.recurring?.meter && (
                                <div>
                                    Bound to meter <code className="font-mono">{p.recurring.meter}</code>
                                </div>
                            )}
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

function MeterList({ probes }: { probes: Array<{ envName: string; id: string | null; error?: string; displayName?: string; eventName?: string; status?: string }> }) {
    return (
        <ul className="space-y-2">
            {probes.map((p) => (
                <li key={p.envName} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <code className="font-mono text-xs text-slate-500">{p.envName}</code>
                        {p.id && <CopyValue value={p.id} />}
                        {!p.id && <span className="text-xs text-red-500">unset</span>}
                    </div>
                    {p.error ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">{p.error}</p>
                    ) : (
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                            <strong className="text-slate-900 dark:text-slate-100">{p.displayName}</strong>{' · '}
                            event_name <code className="font-mono">{p.eventName}</code>{' · '}
                            status <code>{p.status}</code>
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

function PortalConfigRow({ label, envName }: { label: string; envName: string }) {
    const value = process.env[envName];
    return (
        <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-sm">{label}</span>
                <code className="font-mono text-xs text-slate-500">{envName}</code>
                {value ? <CopyValue value={value} /> : <span className="text-xs text-red-500">unset</span>}
            </div>
        </li>
    );
}
