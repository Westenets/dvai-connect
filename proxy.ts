import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge proxy (was `middleware.ts` in Next < 16; renamed to `proxy.ts`
 * in Next 16). Two responsibilities:
 *
 *   1. CORS preflight + headers for /api/* (browser + mobile clients).
 *   2. Layer 1 admin RBAC: gate /admin/* on Appwrite session-cookie
 *      presence so unauthenticated visitors never reach the server
 *      component render. Layers 2 + 3 (actual role checks) live in
 *      app/admin/layout.tsx and the /api/admin/* route handlers.
 */

const APPWRITE_SESSION_COOKIE = `a_session_${process.env.NEXT_PUBLIC_APPWRITE_PROJECT ?? ''}`;

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // --- Admin RBAC gate (Layer 1) ---
    if (pathname.startsWith('/admin')) {
        const session = request.cookies.get(APPWRITE_SESSION_COOKIE)?.value;
        if (!session) {
            const url = request.nextUrl.clone();
            url.pathname = '/login';
            url.searchParams.set('next', pathname);
            return NextResponse.redirect(url);
        }
        return NextResponse.next();
    }

    // --- CORS for /api/* ---
    // 1. CORS Preflight Handling
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-user-id',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const response = NextResponse.next();

    // 2. Add CORS headers to all API responses
    if (pathname.startsWith('/api')) {
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, x-api-key, x-user-id',
        );

        // 3. Optional: API Key Security check
        // Only enforce if MOBILE_API_KEY is set in .env
        const mobileApiKey = process.env.MOBILE_API_KEY;
        if (mobileApiKey) {
            const providedKey = request.headers.get('x-api-key');

            // We allow browser requests (no key) if they come from the same origin
            const isSameOrigin = request.headers.get('origin') === request.nextUrl.origin;

            if (!isSameOrigin && providedKey !== mobileApiKey) {
                return new NextResponse(
                    JSON.stringify({ error: 'Unauthorized: Invalid API Key' }),
                    {
                        status: 401,
                        headers: { 'Content-Type': 'application/json' },
                    },
                );
            }
        }
    }

    return response;
}

export const config = {
    // Run on /api/* (CORS) and /admin/* (RBAC).
    matcher: ['/api/:path*', '/admin/:path*'],
};
