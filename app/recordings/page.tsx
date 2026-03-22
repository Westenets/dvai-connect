'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import RecordingsClient from './RecordingsClient';

export default function RecordingsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    if (isLoading || !user) {
        return (
            <div className="min-h-screen bg-[#f5f7f8] dark:bg-[#101922] flex items-center justify-center text-slate-500">
                Loading...
            </div>
        );
    }

    return <RecordingsClient user={user} />;
}
