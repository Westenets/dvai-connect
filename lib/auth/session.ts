import { cookies } from 'next/headers';
import { Client as ServerClient, Account as ServerAccount } from 'node-appwrite';

/**
 * Server-side session helpers. Reads the Appwrite session cookie that the
 * browser SDK sets after login and resolves it via node-appwrite to a User
 * record.
 *
 * Used by:
 *   - lib/auth/admin.ts > requireAdmin (server-component RBAC)
 *   - all paid-feature gates in /api/* route handlers
 *   - server actions that need to know the current user (Stripe checkout
 *     session creation, signup-with-code submission, etc.)
 *
 * Returns null when there's no session or it can't be verified. Callers
 * decide between 401 (API routes) and redirect (server components).
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;

function buildClient(sessionValue: string): ServerClient {
    return new ServerClient()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT)
        .setSession(sessionValue);
}

/**
 * Read the Appwrite session cookie value. Appwrite's browser SDK stores
 * the session under the cookie name `a_session_<projectId>`. In Next.js 16
 * the cookies() helper is async (was sync in <15).
 */
async function getSessionCookieValue(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const cookieName = `a_session_${PROJECT}`;
        const v = cookieStore.get(cookieName)?.value;
        if (v) return v;
        // Legacy / fallback cookie name (Appwrite has used variations).
        const legacy = cookieStore.get('a_session')?.value;
        return legacy ?? null;
    } catch (err) {
        // cookies() throws in some build contexts; treat as unauthenticated.
        console.warn('[auth/session] cookies() failed:', err);
        return null;
    }
}

export async function getCurrentUser(): Promise<{
    $id: string;
    name: string;
    email: string;
    prefs: Record<string, any>;
    /** Appwrite account labels. The 'admin' label is the platform-
     *  level admin marker (set by ops on DVAI staff accounts), separate
     *  from per-team admin/owner roles. */
    labels: string[];
} | null> {
    const sessionValue = await getSessionCookieValue();
    if (!sessionValue) return null;
    try {
        const client = buildClient(sessionValue);
        const account = new ServerAccount(client);
        const me = await account.get();
        return {
            $id: me.$id,
            name: me.name,
            email: me.email,
            prefs: me.prefs ?? {},
            labels: (me as { labels?: string[] }).labels ?? [],
        };
    } catch (err: any) {
        // Invalid session or revoked token — treat as unauthenticated.
        console.warn('[auth/session] account.get failed:', err?.message ?? err);
        return null;
    }
}

/**
 * Convenience: returns the user id or throws. For API route handlers
 * that have already established 401 isn't a possibility.
 */
export async function requireUserId(): Promise<string> {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    return user.$id;
}
