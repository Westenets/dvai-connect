import Link from 'next/link';

/**
 * Admin sidebar navigation. Static for v1 — no client-side active-link
 * state to keep this server-rendered. The active link styling is
 * handled by the consuming page passing `current` prop.
 */
export function AdminSidebar({ current }: { current?: string }) {
    const items: Array<{ href: string; label: string; key: string }> = [
        { href: '/admin', label: 'Overview', key: 'overview' },
        { href: '/admin/pricing', label: 'Pricing', key: 'pricing' },
        { href: '/admin/organizations', label: 'Organizations', key: 'organizations' },
        { href: '/admin/recordings', label: 'Recordings', key: 'recordings' },
        { href: '/admin/rooms', label: 'Rooms', key: 'rooms' },
        { href: '/admin/branding', label: 'Branding', key: 'branding' },
    ];
    return (
        <nav className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3">
                Admin
            </div>
            <ul className="space-y-1">
                {items.map((it) => {
                    const active = current === it.key;
                    return (
                        <li key={it.key}>
                            <Link
                                href={it.href}
                                className={
                                    'block rounded-md px-3 py-2 text-sm ' +
                                    (active
                                        ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')
                                }
                            >
                                {it.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
