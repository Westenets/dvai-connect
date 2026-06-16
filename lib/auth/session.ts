import { cookies } from 'next/headers';
import { Client as ServerClient, Account as ServerAccount } from 'node-appwrite';

/**
 * Server-side session helpers.
 *
 * Reads the `dvai_session` HttpOnly cookie set by /api/auth/sync (the
 * JWT bridge from the Appwrite browser SDK to our domain) and
 * authenticates the request via Appwrite's setJWT path.
 *
 * Used by:
 *   - lib/auth/admin.ts > requireAdmin (server-component RBAC)
 *   - all paid-feature gates in /api/* route handlers
 *   - server actions that need to know the current user (Stripe
 *     checkout creation, signup-with-code submission, etc.)
 *   - proxy.ts (Layer 1 admin gate — cookie presence only, not value)
 *
 * Returns null on no session or verification failure. Callers choose
 * between 401 (API routes) and redirect (server components).
 */

export const SESSION_COOKIE_NAME = 'dvai_session';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;

function buildClient(jwt: string): ServerClient {
    return new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setJWT(jwt);
}

async function getSessionJwt(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const v = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        return v ?? null;
    } catch (err) {
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
    const jwt = await getSessionJwt();
    if (!jwt) return null;
    try {
        const client = buildClient(jwt);
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
        // Expired or invalid JWT — treat as unauthenticated. The
        // client will refresh the JWT on its next ping and resync.
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

/**
 * Server-action helper for code paths that need the raw JWT to forward
 * to Appwrite SDK calls (rare — most code should call getCurrentUser
 * and use the resolved user fields).
 */
export async function getRawSessionJwt(): Promise<string | null> {
    return getSessionJwt();
}
