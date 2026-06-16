import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/admin';
import { AdminSidebar } from '@/lib/components/admin/Sidebar';

export const metadata: Metadata = {
    title: 'Admin — DVAI Connect',
};

/**
 * Admin layout — Layer 2 RBAC gate. requireAdmin redirects to /login
 * or / if the user isn't a team admin/owner. Sub-pages can rely on
 * this guard having run.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await requireAdmin();
    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] h-full overflow-hidden flex font-['Inter',sans-serif] text-slate-900 dark:text-slate-100">
            <AdminSidebar />
            <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
    );
}
