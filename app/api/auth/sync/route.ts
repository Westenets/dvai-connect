import { NextResponse } from 'next/server';

/**
 * POST /api/auth/sync — set the DVAI session cookie from an Appwrite JWT.
 * DELETE /api/auth/sync — clear the DVAI session cookie.
 *
 * Why this exists: the Appwrite browser SDK stores its session on the
 * Appwrite endpoint's domain (e.g. api.mega-voice-command.com), NOT on
 * our app's domain. Server components running on connect.deepvoiceai.co
 * (or localhost:3000 in dev) therefore can't see any session cookie
 * with just the Appwrite SDK.
 *
 * The bridge: client calls `account.createJWT()` after login, POSTs the
 * resulting token here, we set it as an HttpOnly cookie on OUR domain.
 * Server-side helpers (lib/auth/session.ts) read that cookie and
 * authenticate the request via `client.setJWT(token).account.get()`.
 *
 * JWT expiry is 15 min (Appwrite default), so AuthProvider refreshes
 * it every ~13 min while a user is active.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const SESSION_COOKIE_NAME = 'dvai_session';
const JWT_TTL_SECONDS = 15 * 60;

export async function POST(request: Request) {
    let body: { jwt?: string };
    try {
        body = (await request.json()) as { jwt?: string };
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const jwt = body?.jwt?.trim();
    if (!jwt) {
        return NextResponse.json({ error: 'jwt field required' }, { status: 400 });
    }
    // JWT format sanity-check (3 base64url segments). Don't verify the
    // signature here — server-side helpers re-verify on every use via
    // the Appwrite API. The cookie is HttpOnly + Secure so a tampered
    // token would just fail the verification, not bypass auth.
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)) {
        return NextResponse.json({ error: 'jwt is not a well-formed JWT' }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: jwt,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: JWT_TTL_SECONDS,
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return res;
}
