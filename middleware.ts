import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
    if (request.nextUrl.pathname.startsWith('/api')) {
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
    matcher: '/api/:path*',
};
