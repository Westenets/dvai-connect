import { AgentDispatchClient } from 'livekit-server-sdk';
import { NextResponse, NextRequest } from 'next/server';
import { getLiveKitURL } from '@/lib/getLiveKitURL';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

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
        const { roomName } = body;

        if (!roomName) {
            return NextResponse.json({ error: 'Room name required' }, { status: 400 });
        }

        // Explicitly dispatch the job to the agent you named "dvai-support".
        // Ensure your agent's WorkerOptions has agentName: 'dvai-support' configured.
        await agentDispatchClient.createDispatch(roomName, 'dvai-support');

        return NextResponse.json({ success: true, message: 'Agent dispatched' });
    } catch (error) {
        console.error('Failed to dispatch agent:', error);
        return NextResponse.json({ error: 'Failed to dispatch agent' }, { status: 500 });
    }
}
