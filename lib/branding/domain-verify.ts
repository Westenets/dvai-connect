import 'server-only';
import { promises as dns } from 'node:dns';
import { randomBytes } from 'node:crypto';

/**
 * Custom-domain DNS verification helpers.
 *
 * We use the DNS TXT-record pattern (same as GitHub Pages, Vercel,
 * Cloudflare Pages, Fly.io). The customer adds a TXT record at
 * `_dvai-connect.<their-domain>` whose value matches a token we
 * generated. We resolve the TXT record and check for an exact match.
 *
 * Why a subdomain prefix (`_dvai-connect.`) rather than the apex:
 *   - keeps our verification token out of the customer's main TXT
 *     bucket (SPF, DMARC, Google verification, etc.)
 *   - lets the customer use the apex itself as the CNAME target
 *     when they're ready to point traffic
 *   - matches every major SaaS pattern, so DNS admins won't blink.
 *
 * Token format: 32 hex chars (16 bytes). High enough entropy that
 * guessing is infeasible; short enough to fit on a single TXT line.
 */

const VERIFICATION_PREFIX_LABEL = '_dvai-connect';
const TOKEN_BYTES = 16;
const TXT_VALUE_PREFIX = 'dvai-verify=';

export function generateVerificationToken(): string {
    return randomBytes(TOKEN_BYTES).toString('hex');
}

export function expectedTxtRecord(token: string): string {
    return `${TXT_VALUE_PREFIX}${token}`;
}

export function verificationHost(customDomain: string): string {
    return `${VERIFICATION_PREFIX_LABEL}.${customDomain}`;
}

export interface VerifyResult {
    ok: boolean;
    matched?: string;
    recordsSeen?: string[];
    error?: string;
}

/**
 * Resolve the TXT records at `_dvai-connect.<customDomain>` and check
 * whether any of them match the expected `dvai-verify=<token>` value.
 *
 * Returns ok=true on match. Returns ok=false + an error description
 * on every other path (no records, NXDOMAIN, network failure, etc.) —
 * callers should treat any failure as "still pending" rather than a
 * destructive "rejected" state.
 */
export async function verifyCustomDomain(
    customDomain: string,
    token: string,
): Promise<VerifyResult> {
    const host = verificationHost(customDomain);
    const expected = expectedTxtRecord(token);
    try {
        const records = await dns.resolveTxt(host);
        // dns.resolveTxt returns string[][] — each TXT record can be
        // multiple chunks (up to 255 chars per chunk). Concat each.
        const flattened = records.map((chunks) => chunks.join(''));
        const matched = flattened.find((r) => r === expected);
        if (matched) {
            return { ok: true, matched, recordsSeen: flattened };
        }
        return {
            ok: false,
            recordsSeen: flattened,
            error:
                flattened.length === 0
                    ? `No TXT records at ${host}.`
                    : `No matching TXT record at ${host}. Expected "${expected}".`,
        };
    } catch (err: any) {
        // Node DNS errors have a `code` like ENOTFOUND, ENODATA, ETIMEOUT.
        const code = err?.code as string | undefined;
        if (code === 'ENOTFOUND' || code === 'ENODATA') {
            return { ok: false, error: `No TXT records found at ${host} (${code}).` };
        }
        if (code === 'ETIMEOUT') {
            return {
                ok: false,
                error: `DNS lookup for ${host} timed out — try again in a minute.`,
            };
        }
        return {
            ok: false,
            error: `DNS lookup for ${host} failed: ${err?.message ?? code ?? String(err)}`,
        };
    }
}
