import Link from 'next/link';
import { NewOrgForm } from './NewOrgForm';

/**
 * Admin: create a new organization.
 *
 * Creates the backing Appwrite Team AND the organizations row in one
 * atomic-ish flow on the server. Generates a fresh signup code so the
 * cohort admin can immediately copy the invite URL.
 */
export const dynamic = 'force-dynamic';

export default function NewOrgPage() {
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
            <header className="mb-6">
                <h1 className="text-2xl font-semibold mb-1">New organization</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Creates the org record + its backing Appwrite Team. A signup code is generated
                    automatically; you can rotate it from the org's detail page later.
                </p>
            </header>
            <NewOrgForm />
        </div>
    );
}
