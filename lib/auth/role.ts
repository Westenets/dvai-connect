import { Client as ServerClient, Teams as ServerTeams } from 'node-appwrite';
import { cookies } from 'next/headers';

/**
 * Role resolution from Appwrite Team memberships.
 *
 * Appwrite Teams is our org primitive. Each Team is one paying org. Team
 * membership roles map directly to app-level roles:
 *
 *   - 'owner'   — Stripe billing contact (1 per team)
 *   - 'admin'   — can access /admin for the org
 *   - 'member'  — regular user
 *
 * Roles are read server-side via the session cookie so they can't be
 * spoofed by a client-side header. Cached for the duration of the
 * request via React.cache when called from server components.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;

export type AppRole = 'member' | 'admin' | 'owner';

async function getSessionCookieValue(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const v = cookieStore.get(`a_session_${PROJECT}`)?.value;
        return v ?? cookieStore.get('a_session')?.value ?? null;
    } catch {
        return null;
    }
}

function buildClient(sessionValue: string): ServerClient {
    return new ServerClient()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT)
        .setSession(sessionValue);
}

/**
 * Returns a Map of teamId → highest role the current user holds in that
 * team. Returns an empty map for unauthenticated users.
 *
 * Roles ranking (highest wins): owner > admin > member.
 */
export async function getUserRoles(): Promise<Map<string, AppRole>> {
    const sessionValue = await getSessionCookieValue();
    if (!sessionValue) return new Map();
    try {
        const client = buildClient(sessionValue);
        const teams = new ServerTeams(client);
        const memberships = await teams.list();
        const out = new Map<string, AppRole>();
        for (const team of memberships.teams) {
            // Get the role list for the current user in this team. The list()
            // call returns Teams; we need listMemberships per team to get the
            // current user's role array, OR check team.prefs if we stored it.
            try {
                const mems = await teams.listMemberships(team.$id);
                const me = mems.memberships.find((m: any) => m.confirm === true);
                if (!me) continue;
                const role: AppRole = me.roles.includes('owner')
                    ? 'owner'
                    : me.roles.includes('admin')
                        ? 'admin'
                        : 'member';
                out.set(team.$id, role);
            } catch {
                // Per-team listing failed; treat as member.
                out.set(team.$id, 'member');
            }
        }
        return out;
    } catch (err) {
        console.warn('[auth/role] getUserRoles failed:', err);
        return new Map();
    }
}

/** Returns the role the current user holds in a specific team, or null. */
export async function getRoleInTeam(teamId: string): Promise<AppRole | null> {
    const all = await getUserRoles();
    return all.get(teamId) ?? null;
}
