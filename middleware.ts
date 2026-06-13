import { NextResponse, type NextRequest } from 'next/server';

/**
 * Layer 1 admin RBAC: middleware-based gate on /admin/*.
 *
 * Edge runtime can't call Appwrite (node-appwrite is a Node SDK), so we
 * only check session-cookie presence here. The actual admin-role check
 * happens in app/admin/layout.tsx (Layer 2 — server component calls
 * requireAdmin from lib/auth/admin.ts) and inside each /api/admin/*
 * route handler (Layer 3 — requireAdminInTeam per teamId).
 *
 * This middleware's job is to short-circuit unauthenticated browser
 * visits before they incur a server-component render. An attacker who
 * forges the cookie name still hits Layer 2 — they can't get past it
 * without a valid Appwrite session.
 */

const APPWRITE_SESSION_COOKIE = `a_session_${process.env.NEXT_PUBLIC_APPWRITE_PROJECT ?? ''}`;

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (!pathname.startsWith('/admin')) return NextResponse.next();
    const session = request.cookies.get(APPWRITE_SESSION_COOKIE)?.value;
    if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
    }
    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
