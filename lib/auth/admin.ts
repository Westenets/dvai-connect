import { redirect } from 'next/navigation';
import { getCurrentUser } from './session';
import { getUserRoles } from './role';

/**
 * Admin-route guards. Three-layer RBAC defense:
 *
 *   Layer 1 — middleware.ts (broad route protection)
 *   Layer 2 — requireAdmin() in server-component layout
 *   Layer 3 — requireAdminInTeam() in each /api/admin/* route handler
 *
 * Each layer independently rejects non-admins, so a bypass at any single
 * layer doesn't let an unauthorized user through.
 */

export async function isOrgAdmin(teamId: string): Promise<boolean> {
    const roles = await getUserRoles();
    const r = roles.get(teamId);
    return r === 'admin' || r === 'owner';
}

/**
 * Server-component guard. Returns { userId, adminTeamIds } when the user
 * is admin in at least one team. Redirects unauthenticated users to /login
 * and authenticated non-admins to /.
 */
export async function requireAdmin(): Promise<{ userId: string; adminTeamIds: string[] }> {
    const user = await getCurrentUser();
    if (!user) redirect('/login');
    const roles = await getUserRoles();
    const adminTeamIds = [...roles.entries()]
        .filter(([, role]) => role === 'admin' || role === 'owner')
        .map(([t]) => t);
    if (adminTeamIds.length === 0) redirect('/');
    return { userId: user.$id, adminTeamIds };
}

/**
 * Per-handler guard for /api/admin/* routes. Throws (caller returns 403)
 * when the current user is not admin in the requested team.
 */
export async function requireAdminInTeam(teamId: string): Promise<string> {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    const isAdmin = await isOrgAdmin(teamId);
    if (!isAdmin) throw new Error('Forbidden');
    return user.$id;
}
