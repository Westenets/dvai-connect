import { NextRequest, NextResponse } from 'next/server';
import { Client, Users } from 'node-appwrite';

// Initialize Appwrite Admin SDK
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '')
    .setKey(process.env.APPWRITE_API_KEY || '');

const users = new Users(client);

export async function POST(req: NextRequest) {
    try {
        const { participant_ids } = await req.json();

        if (!participant_ids || !Array.isArray(participant_ids)) {
            return NextResponse.json({ error: 'participant_ids is required and must be an array' }, { status: 400 });
        }

        const results = await Promise.all(
            participant_ids.map(async (id) => {
                // Optimization: Validate if it looks like an Appwrite User ID
                // - Typical Appwrite ID length is 20
                // - Alphanumeric
                // - No spaces
                const isPossibleId = 
                    id.length === 20 && 
                    /^[a-zA-Z0-9]+$/.test(id) && 
                    !id.includes(' ');

                if (!isPossibleId) {
                    return { id, name: id, avatarUrl: null, isRegistered: false };
                }

                try {
                    const user = await users.get(id);
                    const prefs = user.prefs || {};
                    return {
                        id,
                        name: user.name || id,
                        avatarUrl: prefs.avatarThumbUrl || prefs.avatarUrl || null,
                        isRegistered: true,
                    };
                } catch (error) {
                    // If user not found or error, treat as non-registered name
                    console.warn(`User fetch failed for ID ${id}:`, error instanceof Error ? error.message : error);
                    return { id, name: id, avatarUrl: null, isRegistered: false };
                }
            })
        );

        return NextResponse.json({ participants: results });
    } catch (error: any) {
        console.error('Users info API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch users info' },
            { status: 500 },
        );
    }
}
