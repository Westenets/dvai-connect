import { NextResponse } from 'next/server';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Query,
} from 'node-appwrite';
import { requireAdmin } from '@/lib/auth/admin';
import { verifyCustomDomain } from '@/lib/branding/domain-verify';

/**
 * POST /api/admin/organizations/[id]/branding/verify-domain
 *
 * Looks up the org's branding row, resolves the
 * `_dvai-connect.<customDomain>` TXT record, and matches against the
 * stored verification token. On success the row flips to
 * status='verified' + verifiedAt=now. On failure status='failed' with
 * an error message — admin can re-click to retry once DNS propagates.
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface BrandingRow {
    $id: string;
    appwriteTeamId: string;
    customDomain?: string;
    customDomainVerificationToken?: string;
}

export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        await requireAdmin();
    } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!API_KEY) return NextResponse.json({ error: 'APPWRITE_API_KEY missing' }, { status: 500 });

    const { id } = await context.params;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const orgDoc = (await databases.getDocument(DB_ID, 'organizations', id)) as unknown as {
            appwriteTeamId: string;
        };
        const teamId = orgDoc.appwriteTeamId;

        const brandingList = await databases.listDocuments(DB_ID, 'org_branding', [
            Query.equal('appwriteTeamId', teamId),
            Query.limit(1),
        ]);
        const branding = brandingList.documents[0] as unknown as BrandingRow | undefined;
        if (!branding) {
            return NextResponse.json(
                { error: 'No branding row for this org. Save the branding form first.' },
                { status: 400 },
            );
        }
        if (!branding.customDomain) {
            return NextResponse.json(
                { error: 'customDomain is empty — fill in the branding form before verifying.' },
                { status: 400 },
            );
        }
        if (!branding.customDomainVerificationToken) {
            return NextResponse.json(
                { error: 'No verification token issued. Save the branding form to mint one.' },
                { status: 400 },
            );
        }

        const result = await verifyCustomDomain(
            branding.customDomain,
            branding.customDomainVerificationToken,
        );
        const checkedAt = new Date().toISOString();
        if (result.ok) {
            await databases.updateDocument(DB_ID, 'org_branding', branding.$id, {
                customDomainVerificationStatus: 'verified',
                customDomainVerifiedAt: checkedAt,
                customDomainCheckedAt: checkedAt,
                customDomainVerificationError: null,
            });
            return NextResponse.json({ ok: true, status: 'verified', checkedAt });
        }
        await databases.updateDocument(DB_ID, 'org_branding', branding.$id, {
            customDomainVerificationStatus: 'failed',
            customDomainCheckedAt: checkedAt,
            customDomainVerificationError: (result.error ?? '').slice(0, 1024),
        });
        return NextResponse.json({
            ok: false,
            status: 'failed',
            error: result.error,
            recordsSeen: result.recordsSeen,
            checkedAt,
        });
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found')) {
            return NextResponse.json(
                {
                    error:
                        'org_branding collection is missing the verification columns. Run scripts/appwrite-migrate-domain-verify-2026-06-14.mjs.',
                },
                { status: 500 },
            );
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
