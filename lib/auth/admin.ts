import { redirect } from 'next/navigation';
import { getCurrentUser } from './session';
import { getUserRoles } from './role';

/**
 * Admin-route guards. Three-layer RBAC defense:
 *
 *   Layer 1 — proxy.ts (broad route protection; cookie-presence only)
 *   Layer 2 — requireAdmin() in server-component layout
 *   Layer 3 — requireAdminInTeam() in each /api/admin/* route handler
 *
 * Each layer independently rejects non-admins, so a bypass at any single
 * layer doesn't let an unauthorized user through.
 *
 * Two ways to qualify as admin (Layer 2 + 3 both honor both):
 *   - Appwrite account-level label `admin` — platform staff bypass.
 *     Granted by ops to DVAI engineers via Appwrite Console →
 *     Auth → user → Labels. Sees every team's admin surface.
 *   - Appwrite Team membership role `admin` or `owner` — per-org
 *     admin. Sees only their own team's admin surface.
 */

export const PLATFORM_ADMIN_LABEL = 'admin';

function hasPlatformAdminLabel(labels: string[] | undefined): boolean {
    return !!labels && labels.includes(PLATFORM_ADMIN_LABEL);
}

export async function isOrgAdmin(teamId: string): Promise<boolean> {
    const user = await getCurrentUser();
    if (!user) return false;
    if (hasPlatformAdminLabel(user.labels)) return true;
    const roles = await getUserRoles();
    const r = roles.get(teamId);
    return r === 'admin' || r === 'owner';
}

/**
 * Server-component guard. Returns { userId, adminTeamIds,
 * isPlatformAdmin } when the user qualifies as admin (platform label
 * OR at least one team admin/owner role). Redirects unauthenticated
 * users to /login and authenticated non-admins to /.
 */
export async function requireAdmin(): Promise<{
    userId: string;
    adminTeamIds: string[];
    isPlatformAdmin: boolean;
}> {
    const user = await getCurrentUser();
    if (!user) redirect('/login');
    const isPlatformAdmin = hasPlatformAdminLabel(user.labels);
    const roles = await getUserRoles();
    const adminTeamIds = [...roles.entries()]
        .filter(([, role]) => role === 'admin' || role === 'owner')
        .map(([t]) => t);
    if (!isPlatformAdmin && adminTeamIds.length === 0) redirect('/');
    return { userId: user.$id, adminTeamIds, isPlatformAdmin };
}

/**
 * Per-handler guard for /api/admin/* routes. Throws (caller returns
 * 403) when the current user is not admin in the requested team AND
 * does not hold the platform-admin label.
 */
export async function requireAdminInTeam(teamId: string): Promise<string> {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    if (hasPlatformAdminLabel(user.labels)) return user.$id;
    const isAdmin = await isOrgAdmin(teamId);
    if (!isAdmin) throw new Error('Forbidden');
    return user.$id;
}
