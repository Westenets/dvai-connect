import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
    Client as ServerClient,
    Databases as ServerDatabases,
    Teams as ServerTeams,
} from 'node-appwrite';
import { generateSignupCode, type Org } from '@/lib/auth/org';
import { OrgInviteCopyBox } from './OrgInviteCopyBox';
import { RegenerateCodeButton } from './RegenerateCodeButton';
import { InviteForm } from './InviteForm';

/**
 * Per-org admin page.
 *
 * Shows everything stored on the organizations row plus a member
 * roster from the backing Appwrite Team. Includes one-click signup-
 * code regeneration (calls /api/admin/organizations/[id]/regenerate
 * which atomically swaps the code and invalidates any in-flight
 * /signup?code=... validations).
 */

export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

interface Member {
    $id: string;
    userId: string;
    userName: string;
    userEmail: string;
    roles: string[];
    joined: string;
    confirm: boolean;
}

async function loadOrg(id: string): Promise<{
    org: Org;
    members: Member[];
} | null> {
    if (!API_KEY) return null;
    try {
        const client = new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
        const databases = new ServerDatabases(client);
        const teams = new ServerTeams(client);
        const doc = await databases.getDocument(DB_ID, 'organizations', id);
        const org = doc as unknown as Org;
        let members: Member[] = [];
        try {
            const mems = await teams.listMemberships(org.appwriteTeamId);
            members = mems.memberships.map((m: any) => ({
                $id: m.$id,
                userId: m.userId,
                userName: m.userName,
                userEmail: m.userEmail,
                roles: m.roles,
                joined: m.joined,
                confirm: m.confirm,
            }));
        } catch (err: any) {
            console.warn('[admin/orgs/[id]] listMemberships failed:', err?.message ?? err);
        }
        return { org, members };
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('not found') || msg.includes('Document with the requested ID')) {
            return { org: null as any, members: [] };
        }
        console.warn('[admin/orgs/[id]] load failed:', msg);
        return null;
    }
}

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await loadOrg(id);
    if (data === null) {
        return (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-5 py-4 text-sm">
                APPWRITE_API_KEY missing — admin data unavailable.
            </div>
        );
    }
    if (!data.org) {
        notFound();
    }
    const { org, members } = data;
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://connect.deepvoiceai.co'}/signup?code=${encodeURIComponent(org.signup_code)}`;
    const seatStatus =
        org.max_seats > 0
            ? `${org.signup_count} / ${org.max_seats} seats used`
            : `${org.signup_count} signups (unlimited)`;

    return (
        <div>
            <div className="mb-6">
                <Link
                    href="/admin/organizations"
                    className="text-sm text-slate-500 hover:text-emerald-500"
                >
                    ← All organizations
                </Link>
            </div>

            <header className="mb-8">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300 uppercase mb-2">
                    {org.program_name} · {org.country}
                </p>
                <h1 className="text-3xl font-semibold mb-1">{org.name}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {seatStatus}
                    {org.commitment_months && ` · ${org.commitment_months}-month commitment`}
                    {' · '}
                    {org.is_active ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Active
                        </span>
                    ) : (
                        <span className="text-slate-400">Inactive</span>
                    )}
                </p>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
                    <h3 className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3">
                        Invite link
                    </h3>
                    <OrgInviteCopyBox url={inviteUrl} code={org.signup_code} />
                    <div className="mt-4 flex justify-end">
                        <RegenerateCodeButton orgId={org.$id} />
                    </div>
                </div>
                <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
                    <h3 className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3">
                        Contacts
                    </h3>
                    <dl className="text-sm space-y-2">
                        <Field
                            label="Primary"
                            value={`${org.primary_contact_name ?? '—'} (${org.primary_contact_email ?? '—'})`}
                        />
                        <Field label="Billing" value={org.billing_contact_email ?? '—'} />
                        <Field label="Tier override" value={org.tier_override ?? 'default'} />
                        <Field
                            label="Backing team"
                            value={<code className="text-xs">{org.appwriteTeamId}</code>}
                        />
                    </dl>
                </div>
            </section>

            <h2 className="text-lg font-semibold mb-3">Members ({members.length})</h2>

            <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 mb-5">
                <h3 className="text-sm font-semibold mb-3">Invite a member</h3>
                <InviteForm orgId={org.$id} />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Appwrite emails the invitee a confirmation link. They appear here once they
                    accept; the badge below shows pending vs joined.
                </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                        <tr>
                            <Th>Name</Th>
                            <Th>Email</Th>
                            <Th>Role</Th>
                            <Th>Status</Th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {members.length === 0 && (
                            <tr>
                                <td colSpan={4} className="text-center py-8 text-sm text-slate-500">
                                    No members in the backing team yet.
                                </td>
                            </tr>
                        )}
                        {members.map((m) => (
                            <tr key={m.$id}>
                                <td className="px-4 py-3 font-medium">
                                    {m.userName || m.userEmail}
                                </td>
                                <td className="px-4 py-3 text-slate-500">{m.userEmail}</td>
                                <td className="px-4 py-3 text-xs">
                                    {m.roles.includes('owner')
                                        ? 'Owner'
                                        : m.roles.includes('admin')
                                          ? 'Admin'
                                          : 'Member'}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                    {m.confirm ? (
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                            Joined
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 dark:text-amber-400">
                                            Pending
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {org.notes && (
                <section className="mt-10">
                    <h2 className="text-lg font-semibold mb-3">Notes</h2>
                    <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 text-sm whitespace-pre-wrap">
                        {org.notes}
                    </div>
                </section>
            )}
        </div>
    );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="text-right">{value}</dd>
        </div>
    );
}

function Th({ children }: { children: React.ReactNode }) {
    return (
        <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-left">
            {children}
        </th>
    );
}
