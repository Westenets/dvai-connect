import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';
import { BrandingForm } from './BrandingForm';
import { DomainVerifyPanel } from './DomainVerifyPanel';

/**
 * Per-org branding editor.
 *
 * Loads (or initializes) the org_branding row for this organization
 * and renders an edit form. The form POSTs to
 * /api/admin/organizations/[id]/branding to persist.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface Org {
    $id: string;
    appwriteTeamId: string;
    name: string;
    tier_override?: string | null;
}

interface BrandingRow {
    $id?: string;
    appwriteTeamId: string;
    logoUrl?: string;
    darkLogoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    customDomain?: string;
    loginScreenCopy?: string;
    emailFromName?: string;
    emailFromAddress?: string;
    customDomainVerificationToken?: string;
    customDomainVerificationStatus?: 'pending' | 'verified' | 'failed';
    customDomainVerifiedAt?: string | null;
    customDomainCheckedAt?: string | null;
    customDomainVerificationError?: string | null;
}

async function loadOrgAndBranding(id: string): Promise<{
    org: Org | null;
    branding: BrandingRow;
} | null> {
    if (!API_KEY) return null;
    const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
    const databases = new ServerDatabases(client);
    let org: Org | null = null;
    let branding: BrandingRow = { appwriteTeamId: '' };
    try {
        const orgDoc = await databases.getDocument(DB_ID, 'organizations', id);
        org = orgDoc as unknown as Org;
        branding.appwriteTeamId = org.appwriteTeamId;
        const b = await databases.listDocuments(DB_ID, 'org_branding', [
            Query.equal('appwriteTeamId', org.appwriteTeamId),
            Query.limit(1),
        ]);
        if (b.documents[0]) branding = b.documents[0] as unknown as BrandingRow;
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found') || msg.includes('Document with the requested ID')) {
            return { org, branding };
        }
        console.warn('[admin/orgs/[id]/branding] load failed:', msg);
    }
    return { org, branding };
}

export default async function AdminOrgBrandingPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const data = await loadOrgAndBranding(id);
    if (!data) {
        return (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm">
                APPWRITE_API_KEY missing — admin data unavailable.
            </div>
        );
    }
    if (!data.org) notFound();

    return (
        <div>
            <div className="mb-6">
                <Link
                    href={`/admin/organizations/${data.org.$id}`}
                    className="text-sm text-slate-500 hover:text-emerald-500"
                >
                    ← {data.org.name}
                </Link>
            </div>
            <header className="mb-6">
                <h1 className="text-2xl font-semibold mb-1">Branding</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Customization for <strong>{data.org.name}</strong>. Runtime only honors these
                    values when the org's tier has customBranding=true (Business + Enterprise).
                </p>
            </header>

            <BrandingForm orgId={data.org.$id} initial={data.branding} />

            <section className="mt-10">
                <h2 className="text-lg font-semibold mb-3">Custom domain</h2>
                <DomainVerifyPanel
                    orgId={data.org.$id}
                    customDomain={data.branding.customDomain}
                    token={data.branding.customDomainVerificationToken}
                    status={data.branding.customDomainVerificationStatus}
                    verifiedAt={data.branding.customDomainVerifiedAt}
                    checkedAt={data.branding.customDomainCheckedAt}
                    lastError={data.branding.customDomainVerificationError}
                />
            </section>
        </div>
    );
}
