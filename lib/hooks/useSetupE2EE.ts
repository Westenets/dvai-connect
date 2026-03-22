import React from 'react';
import { ExternalE2EEKeyProvider } from 'livekit-client';
import { decodePassphrase } from '@/lib/client-utils';

export function useSetupE2EE() {
    const e2eePassphrase = React.useMemo(() => {
        if (typeof window === 'undefined') return undefined;
        const hash = location.hash.substring(1);
        return hash ? decodePassphrase(hash) : undefined;
    }, []);

    const worker = React.useMemo(() => {
        if (typeof window === 'undefined' || !e2eePassphrase) return undefined;
        return new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
    }, [e2eePassphrase]);

    return { worker, e2eePassphrase };
}
