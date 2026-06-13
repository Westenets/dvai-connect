import Link from 'next/link';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import {
    DataTable,
    formatDateTime,
    type Column,
} from '@/lib/components/admin/DataTable';
import type { Org } from '@/lib/auth/org';

/**
 * Admin Organizations — cohort / signup-code management.
 *
 * Server-rendered list. The detail view at [id]/page.tsx handles
 * member roster + signup-code regeneration. New-org creation is
 * deferred (creating a new org also requires creating its backing
 * Appwrite Team + assigning roles, which is a multi-step flow that
 * needs more care than a list scaffold).
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

async function loadOrgs(): Promise<Org[] | null> {
    if (!API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, 'organizations', [
            Query.orderDesc('$createdAt'),
            Query.limit(200),
        ]);
        return res.documents as unknown as Org[];
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) return [];
        console.warn('[admin/orgs] load failed:', msg);
        return null;
    }
}

export default async function AdminOrganizationsPage() {
    const orgs = await loadOrgs();

    const columns: Array<Column<Org>> = [
        {
            key: 'name',
            header: 'Name',
            render: (o) => (
                <Link
                    href={`/admin/organizations/${o.$id}`}
                    className="font-semibold underline decoration-dotted underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                    {o.name}
                </Link>
            ),
        },
        { key: 'program_name', header: 'Program', muted: true },
        { key: 'country', header: 'Country', muted: true, align: 'center' },
        {
            key: 'tier_override',
            header: 'Tier',
            align: 'center',
            render: (o) =>
                o.tier_override ? (
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                        {o.tier_override.replace('_', ' ')}
                    </span>
                ) : (
                    <span className="text-slate-400">default</span>
                ),
        },
        {
            key: 'seats',
            header: 'Seats',
            align: 'right',
            render: (o) =>
                o.max_seats > 0
                    ? `${o.signup_count} / ${o.max_seats}`
                    : `${o.signup_count} / ∞`,
        },
        {
            key: 'expires_at',
            header: 'Expires',
            muted: true,
            render: (o) => formatDateTime(o.expires_at),
        },
        {
            key: 'is_active',
            header: 'Status',
            align: 'center',
            render: (o) =>
                o.is_active ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                ) : (
                    <span className="text-slate-400">Inactive</span>
                ),
        },
    ];

    return (
        <div>
            <header className="flex items-end justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold mb-1">Organizations</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Cohorts / programs with their signup codes, seat caps, and
                        tier overrides. Click a row to manage members and regenerate
                        the signup code.
                    </p>
                </div>
                <Link
                    href="/admin/organizations/new"
                    className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-semibold px-4 py-2"
                >
                    + New organization
                </Link>
            </header>

            <DataTable
                columns={columns}
                rows={orgs ?? []}
                rowKey={(o) => o.$id}
                emptyState={
                    orgs === null
                        ? 'KPI source unavailable (APPWRITE_API_KEY missing or organizations collection not migrated).'
                        : 'No organizations yet. Use the "+ New organization" button above to create one.'
                }
            />
        </div>
    );
}
