import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createCheckoutSession } from '@/lib/actions/stripe';
import type { PaidTierId } from '@/lib/pricing/stripe-config';

/**
 * POST /api/checkout
 *
 * Body: { tier: 'pro_africa' | 'pro' | 'business' | 'enterprise',
 *         quantity?: number,
 *         signupCode?: string }
 *
 * Response: { clientSecret, sessionId }
 *
 * The caller embeds the returned clientSecret in Stripe's <EmbeddedCheckoutProvider>
 * to render the Checkout UI inline.
 */

const ALLOWED_TIERS: ReadonlySet<PaidTierId> = new Set<PaidTierId>([
    'pro_africa',
    'pro',
    'business',
    'enterprise',
]);

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tier = body.tier as PaidTierId | undefined;
    if (!tier || !ALLOWED_TIERS.has(tier)) {
        return NextResponse.json(
            { error: `tier must be one of: ${[...ALLOWED_TIERS].join(', ')}` },
            { status: 400 },
        );
    }

    const quantity = typeof body.quantity === 'number' ? body.quantity : undefined;
    const signupCode = typeof body.signupCode === 'string' ? body.signupCode : undefined;

    // Africa cohort tier requires a signup code — the public /pricing page
    // never exposes pro_africa as a self-serve option; it's reached only
    // via the cohort-restricted /pricing/africa route. Block any direct
    // hit on this endpoint that bypasses that flow.
    if (tier === 'pro_africa' && !signupCode) {
        return NextResponse.json(
            { error: 'Pro (Africa Cohort) requires a valid cohort signup code' },
            { status: 403 },
        );
    }

    try {
        const { clientSecret, sessionId } = await createCheckoutSession({
            userId: user.$id,
            userEmail: user.email,
            userName: user.name,
            tier,
            quantity,
            signupCode,
        });
        return NextResponse.json({ clientSecret, sessionId });
    } catch (err: any) {
        console.error('[api/checkout] failed:', err?.message ?? err);
        return NextResponse.json(
            { error: err?.message ?? 'Failed to create checkout session' },
            { status: 500 },
        );
    }
}
