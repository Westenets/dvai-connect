import { NextResponse } from 'next/server';
import { isPaidUser } from '@/lib/auth/subscription';

/**
 * Returns a short-lived Deepgram API token for paid users.
 *
 * For v1 (this spec), isPaidUser() is a stub that returns false, so
 * this endpoint always 402s. Problem #5 wires up the real check.
 *
 * In production, swap the static API key flow for Deepgram's
 * "Generate Temporary API Key" endpoint:
 *   https://developers.deepgram.com/docs/manage-keys#create-key
 * which returns a TTL-bound token suitable for client use.
 */

export async function POST(_req: Request) {
    if (!isPaidUser()) {
        return NextResponse.json(
            { error: 'Cloud transcription requires a paid plan.' },
            { status: 402 },
        );
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: 'Cloud STT not configured on this server.' },
            { status: 503 },
        );
    }

    // TODO (problem #5): swap for Deepgram temporary-key API. For now
    // we return the static key — only works for paid users (gated above)
    // and the route requires session auth in production.
    return NextResponse.json({
        token: apiKey,
        baseUrl: 'wss://api.deepgram.com/v1/listen',
    });
}
