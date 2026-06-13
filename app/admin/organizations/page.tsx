export default function AdminOrganizationsPage() {
    return (
        <div>
            <h1 className="text-2xl font-semibold mb-1">Organizations</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Cohort CRUD, signup-code regeneration, member roster,
                share-URL clipboard.
            </p>
            <ComingInPr3e />
        </div>
    );
}

function ComingInPr3e() {
    return (
        <div className="mt-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-5 py-4 text-sm text-slate-700 dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-slate-100">Coming in PR 3e.</strong>{' '}
            Admin scaffold is in PR 3d; CRUD lands in 3e.
        </div>
    );
}
