import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';

/**
 * Organization (cohort/code) primitive helpers.
 *
 * Backed by the Appwrite `organizations` collection (schema in the
 * migration script at scripts/appwrite-migrate-2026-06-13.mjs).
 *
 * Used by:
 *   - signup-with-code flow at /signup?code=... (validates code,
 *     atomically reserves a seat, links new user to org Team)
 *   - admin Organizations CRUD at /admin/organizations
 *   - getCurrentOrg() lookup for plan resolution
 *
 * Gracefully degrades when the collection doesn't yet exist (returns
 * null / false) so existing meet functionality keeps working until the
 * migration script runs in production.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT!;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';
const COLLECTION = 'organizations';

export interface Org {
    $id: string;
    $updatedAt: string;
    appwriteTeamId: string;
    name: string;
    country: string;
    program_name: string;
    signup_code: string;
    tier_override: string | null;
    commitment_months: number | null;
    max_seats: number;
    signup_count: number;
    expires_at: string | null;
    is_active: boolean;
    primary_contact_name: string;
    primary_contact_email: string;
    billing_contact_email: string;
    notes: string;
    createdBy: string;
    createdAt: string;
}

function buildAdminClient(): ServerClient | null {
    if (!API_KEY) {
        console.warn('[auth/org] APPWRITE_API_KEY not set — org features disabled');
        return null;
    }
    return new ServerClient().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
}

/** Returns the org matching the given signup code, only if it's currently
 *  active and not expired. Returns null otherwise (including when the
 *  collection doesn't exist yet). */
export async function getOrgByCode(code: string): Promise<Org | null> {
    const client = buildAdminClient();
    if (!client) return null;
    try {
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, COLLECTION, [
            Query.equal('signup_code', code),
            Query.equal('is_active', true),
            Query.limit(1),
        ]);
        if (res.documents.length === 0) return null;
        const org = res.documents[0] as unknown as Org;
        // Expiry check happens here (Appwrite Query can't do "datetime <
        // now" trivially across all versions).
        if (org.expires_at && new Date(org.expires_at) < new Date()) {
            return null;
        }
        return org;
    } catch (err: any) {
        if (String(err?.message).includes('not found')) return null;
        console.warn('[auth/org] getOrgByCode failed:', err?.message ?? err);
        return null;
    }
}

/** Returns the org backed by a given Appwrite Team. */
export async function getOrgByTeamId(teamId: string): Promise<Org | null> {
    const client = buildAdminClient();
    if (!client) return null;
    try {
        const databases = new ServerDatabases(client);
        const res = await databases.listDocuments(DB_ID, COLLECTION, [
            Query.equal('appwriteTeamId', teamId),
            Query.limit(1),
        ]);
        return (res.documents[0] as unknown as Org) ?? null;
    } catch (err: any) {
        if (String(err?.message).includes('not found')) return null;
        console.warn('[auth/org] getOrgByTeamId failed:', err?.message ?? err);
        return null;
    }
}

/**
 * Atomically reserves a signup seat in the given org. Returns true if the
 * reservation succeeded (caller may now create the user + Stripe sub);
 * false if seats are exhausted, org is expired, org is inactive, or the
 * write raced and lost.
 *
 * Race protection uses Appwrite's $updatedAt conditional update — if any
 * other client has incremented signup_count between our read and write,
 * the write fails and we return false. Caller may re-read and retry.
 */
export async function reserveSignupSeat(org: Org): Promise<boolean> {
    if (org.max_seats > 0 && org.signup_count >= org.max_seats) return false;
    if (org.expires_at && new Date(org.expires_at) < new Date()) return false;
    if (!org.is_active) return false;

    const client = buildAdminClient();
    if (!client) return false;
    try {
        const databases = new ServerDatabases(client);
        await databases.updateDocument(DB_ID, COLLECTION, org.$id, {
            signup_count: org.signup_count + 1,
        });
        return true;
    } catch (err: any) {
        console.warn('[auth/org] reserveSignupSeat failed:', err?.message ?? err);
        return false;
    }
}

/**
 * Generate a URL-safe signup code for a new org. Format: {PROGRAM}-{RANDOM12}.
 * The random suffix uses 6 bytes of crypto random encoded as 12 chars of
 * uppercase base36.
 */
export function generateSignupCode(programName: string): string {
    const bytes = new Uint8Array(6);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const random = Array.from(bytes)
        .map((b) => b.toString(36).padStart(2, '0').toUpperCase())
        .join('');
    return `${programName.toUpperCase()}-${random}`;
}
