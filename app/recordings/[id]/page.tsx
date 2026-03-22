'use client';

import React, { useEffect, useState } from 'react';
import { databases } from '@/lib/appwrite';
import RecordingDetailClient from './RecordingDetailClient';
import { notFound, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function RecordingDetailPage({ params }: PageProps) {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [recording, setRecording] = useState<any>(null);
    const [participants, setParticipants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [id, setId] = useState<string | null>(null);

    useEffect(() => {
        params.then((p) => setId(p.id));
    }, [params]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!id || authLoading || !user) return;

        async function fetchData() {
            setLoading(true);
            try {
                const rec = await databases.getDocument('dvai-connect', 'recordings', id!);
                setRecording(rec);

                if (rec.participant_ids && rec.participant_ids.length > 0) {
                    const pRes = await fetch('/api/users/info', {
                        method: 'POST',
                        body: JSON.stringify({ participant_ids: rec.participant_ids }),
                        headers: { 'Content-Type': 'application/json' },
                    });
                    if (pRes.ok) {
                        const pData = await pRes.json();
                        setParticipants(pData.participants || []);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
                setRecording(null);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [id, user, authLoading]);

    if (authLoading || loading || !id) {
        return (
            <div className="min-h-screen bg-white dark:bg-[#101922] flex items-center justify-center text-slate-400">
                <div className="flex flex-col items-center gap-3">
                    <div className="size-10 border-4 border-[#00a8a8] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-medium animate-pulse text-slate-500 dark:text-slate-400">Loading recording...</p>
                </div>
            </div>
        );
    }

    if (!recording) {
        return notFound();
    }

    return <RecordingDetailClient recording={recording} participants={participants} />;
}
