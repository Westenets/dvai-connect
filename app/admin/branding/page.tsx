import Link from 'next/link';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { DataTable, type Column } from '@/lib/components/admin/DataTable';

/**
 * Admin Branding list — every org's branding row at a glance.
 *
 * For v1 the per-org edit happens at /admin/organizations/[id]/branding
 * (still TBD) but exposing this list ensures admins can see who's set
 * which customization. Enterprise + Business tiers are the only tiers
 * with customBranding=true in tiers.ts — orgs on other tiers can have
 * rows here but the runtime won't apply them.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface BrandingRow {
    $id: string;
    appwriteTeamId: string;
    logoUrl?: string;
    darkLogoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    customDomain?: string;
    loginScreenCopy?: string;
    emailFromName?: string;
    emailFromAddress?: string;
}

interface OrgLite {
    $id: string;
    appwriteTeamId: string;
    name: string;
}

async function loadBranding(): Promise<{
    rows: BrandingRow[];
    orgsByTeamId: Map<string, OrgLite>;
} | null> {
    if (!API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const [b, o] = await Promise.all([
            databases.listDocuments(DB_ID, 'org_branding', [Query.limit(200)]),
            databases.listDocuments(DB_ID, 'organizations', [Query.limit(500)]),
        ]);
        const orgsByTeamId = new Map<string, OrgLite>();
        for (const raw of o.documents) {
            const org = raw as unknown as OrgLite;
            orgsByTeamId.set(org.appwriteTeamId, org);
        }
        return { rows: b.documents as unknown as BrandingRow[], orgsByTeamId };
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) {
            return { rows: [], orgsByTeamId: new Map() };
        }
        console.warn('[admin/branding] load failed:', msg);
        return null;
    }
}

export default async function AdminBrandingPage() {
    const data = await loadBranding();

    const columns: Array<Column<BrandingRow>> = [
        {
            key: 'org',
            header: 'Organization',
            render: (r) => {
                const org = data?.orgsByTeamId.get(r.appwriteTeamId);
                if (org) {
                    return (
                        <Link
                            href={`/admin/organizations/${org.$id}/branding`}
                            className="font-semibold underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                            {org.name}
                        </Link>
                    );
                }
                return (
                    <span className="text-slate-500 italic">unknown ({r.appwriteTeamId})</span>
                );
            },
        },
        {
            key: 'logoUrl',
            header: 'Logo',
            render: (r) =>
                r.logoUrl ? (
                    <img src={r.logoUrl} alt="logo" className="h-6 max-w-[140px] object-contain" />
                ) : (
                    <span className="text-slate-400">—</span>
                ),
        },
        {
            key: 'primaryColor',
            header: 'Primary',
            render: (r) =>
                r.primaryColor ? (
                    <span className="inline-flex items-center gap-2">
                        <span
                            className="inline-block w-4 h-4 rounded border border-slate-300"
                            style={{ backgroundColor: r.primaryColor }}
                        />
                        <code className="text-xs">{r.primaryColor}</code>
                    </span>
                ) : (
                    <span className="text-slate-400">—</span>
                ),
        },
        {
            key: 'accentColor',
            header: 'Accent',
            render: (r) =>
                r.accentColor ? (
                    <span className="inline-flex items-center gap-2">
                        <span
                            className="inline-block w-4 h-4 rounded border border-slate-300"
                            style={{ backgroundColor: r.accentColor }}
                        />
                        <code className="text-xs">{r.accentColor}</code>
                    </span>
                ) : (
                    <span className="text-slate-400">—</span>
                ),
        },
        { key: 'customDomain', header: 'Custom domain', muted: true, render: (r) => r.customDomain ?? '—' },
        {
            key: 'emailFrom',
            header: 'Email from',
            muted: true,
            render: (r) =>
                r.emailFromAddress ? (
                    <>
                        {r.emailFromName ?? ''} &lt;{r.emailFromAddress}&gt;
                    </>
                ) : (
                    '—'
                ),
        },
    ];

    return (
        <div>
            <header className="mb-6">
                <h1 className="text-2xl font-semibold mb-1">Branding</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Per-organization branding. Customization is honored at
                    runtime only for orgs whose tier has{' '}
                    <code>customBranding=true</code> (Business + Enterprise).
                </p>
            </header>

            <div className="mb-5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-4 text-sm">
                <strong className="font-semibold">v1 note:</strong> Branding
                rows are managed from an org's detail page. Logo upload uses a
                URL field for v1 — drag-and-drop upload through an Appwrite
                Storage bucket is a follow-up. Custom domain is accepted but
                DNS verification is deferred to Phase 2.
            </div>

            <DataTable
                columns={columns}
                rows={data?.rows ?? []}
                rowKey={(r) => r.$id}
                emptyState={
                    data === null
                        ? 'APPWRITE_API_KEY missing — admin data unavailable.'
                        : 'No branding rows yet. Visit any org detail page → Branding to add one.'
                }
            />
        </div>
    );
}
