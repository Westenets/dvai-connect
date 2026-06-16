import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse, NextRequest } from 'next/server';
import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPlan } from '@/lib/auth/subscription';
import { TIERS } from '@/lib/pricing/tiers';

// ParticipantInfo.Kind enum from livekit.proto (stable since v1.0):
//   STANDARD = 0, INGRESS = 1, EGRESS = 2, SIP = 3, AGENT = 4
// `livekit-server-sdk` doesn't re-export the enum and `@livekit/protocol`
// is only a transitive dep, so we use the literal value here. If the
// proto ever changes, the smoke suite will catch it.
const PARTICIPANT_KIND_AGENT = 4;

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

/**
 * Feature flag: when 'true', the route requires an authenticated paid user
 * AND checks the agent concurrency quota for the room.
 *
 * Default 'false' (off) so existing meeting flows are unaffected until the
 * full payment system lands (Stripe + Appwrite subscriptions + admin
 * panel — Tasks 1 PR 3b through 3e). Flip to 'true' once those land and
 * tier-aware gating is desired in production.
 *
 * Sidelined for user action.
 */
const PAID_GATES_ENABLED = process.env.PAID_FEATURE_GATES_ENABLED === 'true';

export async function POST(request: NextRequest) {
    if (!LIVEKIT_URL) {
        throw new Error('Endpoint is not defined');
    }
    const region = request.nextUrl.searchParams.get('region');
    const livekitServerUrl = getLiveKitURL(LIVEKIT_URL, region);
    if (livekitServerUrl === undefined) {
        throw new Error('Invalid region');
    }
    const agentDispatchClient = new AgentDispatchClient(livekitServerUrl, API_KEY, API_SECRET);
    try {
        const body = await request.json();
        const { roomName, e2eePassphrase } = body;

        if (!roomName) {
            return NextResponse.json({ error: 'Room name required' }, { status: 400 });
        }

        // Paid-feature gate (off by default until subscriptions infra lands).
        // When enabled: require authenticated user; require their tier to
        // include meeting agents; reject if room already has an agent.
        if (PAID_GATES_ENABLED) {
            const user = await getCurrentUser();
            if (!user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            // Resolve tier from the Appwrite subscriptions collection
            // populated by the Stripe webhook event processor. Returns
            // 'free' on misconfiguration or no active subscription.
            const tier = await getUserPlan(user.$id);
            if (TIERS[tier].meetingAgentQuota === 0) {
                return NextResponse.json(
                    { error: 'Meeting agent requires Pro or higher.' },
                    { status: 402 },
                );
            }
            // Concurrency check via roomService.
            const roomService = new RoomServiceClient(livekitServerUrl, API_KEY, API_SECRET);
            const participants = await roomService.listParticipants(roomName);
            const agentCount = participants.filter(
                (p) => (p.kind as unknown as number) === PARTICIPANT_KIND_AGENT,
            ).length;
            if (agentCount >= TIERS[tier].meetingAgentQuota) {
                return NextResponse.json(
                    { error: 'Meeting agent quota reached for this room.' },
                    { status: 409 },
                );
            }
        }

        // Explicitly dispatch the job to the agent you named "dvai-support".
        // Ensure your agent's WorkerOptions has agentName: 'dvai-support' configured.
        await agentDispatchClient.createDispatch(roomName, 'dvai-support', {
            metadata: e2eePassphrase,
        });

        return NextResponse.json({ success: true, message: 'Agent dispatched' });
    } catch (error) {
        console.error('Failed to dispatch agent:', error);
        return NextResponse.json({ error: 'Failed to dispatch agent' }, { status: 500 });
    }
}
