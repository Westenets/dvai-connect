import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { KpiCard } from '@/lib/components/admin/KpiCard';

/**
 * Admin overview dashboard.
 *
 * Reads basic KPIs from Appwrite directly via the server admin client.
 * The numbers shown are intentionally simple for v1 — Pricing/Orgs/
 * Recordings/Rooms sub-pages (PR 3e) drill into the details.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface Kpis {
    paidCustomers: number;
    activeRoomsNow: number;
    cohorts: number;
}

async function loadKpis(): Promise<Kpis | null> {
    if (!ENDPOINT || !PROJECT || !API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const [paid, rooms, orgs] = await Promise.all([
            databases
                .listDocuments(DB_ID, 'subscriptions', [
                    Query.equal('status', ['active', 'trialing']),
                    Query.limit(1),
                ])
                .catch(() => ({ total: 0 })),
            databases
                .listDocuments(DB_ID, 'active_rooms', [Query.limit(1)])
                .catch(() => ({ total: 0 })),
            databases
                .listDocuments(DB_ID, 'organizations', [
                    Query.equal('is_active', true),
                    Query.limit(1),
                ])
                .catch(() => ({ total: 0 })),
        ]);
        return {
            paidCustomers: (paid as { total?: number }).total ?? 0,
            activeRoomsNow: (rooms as { total?: number }).total ?? 0,
            cohorts: (orgs as { total?: number }).total ?? 0,
        };
    } catch (err: any) {
        console.warn('[admin/overview] loadKpis failed:', err?.message ?? err);
        return null;
    }
}

export default async function AdminOverview() {
    const kpis = await loadKpis();
    return (
        <div>
            <h1 className="text-2xl font-semibold mb-1">Overview</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
                Snapshot of the meet workspace right now.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <KpiCard
                    label="Paid customers"
                    value={kpis ? String(kpis.paidCustomers) : '—'}
                    sublabel="Active + trialing subscriptions"
                    tone="positive"
                />
                <KpiCard
                    label="Active rooms now"
                    value={kpis ? String(kpis.activeRoomsNow) : '—'}
                    sublabel="Live meetings (mirrored from LiveKit)"
                />
                <KpiCard
                    label="Cohorts"
                    value={kpis ? String(kpis.cohorts) : '—'}
                    sublabel="Active organizations / cohorts"
                />
            </div>
            {!kpis && (
                <div className="mt-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
                    <strong className="font-semibold">KPIs unavailable.</strong> APPWRITE_API_KEY
                    isn't configured for this environment. Set it in .env.local and reload to
                    populate the dashboard.
                </div>
            )}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                <SectionLink
                    href="/admin/pricing"
                    title="Pricing"
                    body="Tier display fields, Stripe price-id mapping, hourly overage rate, concurrent big-room fee."
                />
                <SectionLink
                    href="/admin/organizations"
                    title="Organizations"
                    body="Cohort CRUD, signup-code regeneration, member roster, share-URL clipboard."
                />
                <SectionLink
                    href="/admin/recordings"
                    title="Recordings"
                    body="All recordings across the workspace, with admin actions (force-stop egress, download, delete)."
                />
                <SectionLink
                    href="/admin/rooms"
                    title="Rooms"
                    body="Live room monitor with per-participant detail."
                />
                <SectionLink
                    href="/admin/branding"
                    title="Branding"
                    body="Per-org branding (logo, colors, custom domain). Enterprise only."
                />
            </div>
        </div>
    );
}

function SectionLink({ href, title, body }: { href: string; title: string; body: string }) {
    return (
        <a
            href={href}
            className="block rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 hover:ring-emerald-400 dark:hover:ring-emerald-500 p-5 transition"
        >
            <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{body}</div>
        </a>
    );
}
