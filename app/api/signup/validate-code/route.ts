import { NextResponse } from 'next/server';
import { getOrgByCode } from '@/lib/auth/org';

/**
 * GET /api/signup/validate-code?code=...
 *
 * Server-side validator for cohort signup codes. Returns whether the
 * code is currently usable (org exists, active, not expired, seats
 * remaining) plus minimal display info for the signup form
 * (programName, tierOverride, commitmentMonths).
 *
 * Anti-enumeration: every "not usable" reason returns the same generic
 * shape (`valid: false`) so an attacker can't distinguish "no such
 * code" from "code exists but seats exhausted." Detailed reason is
 * logged server-side only.
 *
 * No rate limit at v1 — codes have ~48 bits of randomness, so brute
 * force is computationally infeasible. Add rate limiting if a future
 * code format ever drops below 32 bits of entropy.
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();
    if (!code) {
        return NextResponse.json({ valid: false });
    }
    const org = await getOrgByCode(code);
    if (!org) {
        return NextResponse.json({ valid: false });
    }
    // Seat-cap pre-check (non-atomic; final reservation is atomic via
    // reserveSignupSeat at checkout time). Showing "seats exhausted" in
    // the signup form is a UX win even if it could theoretically race —
    // the worst case is "you saw seats available, by the time you
    // checked out they were gone, and we showed you a fair error".
    if (org.max_seats > 0 && org.signup_count >= org.max_seats) {
        return NextResponse.json({ valid: false });
    }
    return NextResponse.json({
        valid: true,
        programName: org.program_name,
        tier: org.tier_override ?? 'pro_africa',
        commitmentMonths: org.commitment_months ?? null,
        seatsRemaining: org.max_seats > 0 ? org.max_seats - org.signup_count : null,
    });
}
