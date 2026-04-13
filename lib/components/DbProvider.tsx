'use client';

import { db } from '@/lib/db';
import { useEffectOnce } from 'react-use';

/**
 * Mounts at app boot (once per client session) to ensure the Dexie
 * IndexedDB database is open before any meeting or recording page
 * tries to read/write to it.
 */
export function DbProvider() {
    useEffectOnce(() => {
        console.log('[DB] Attempting to open EdgeMeetingIntelligenceDB...');
        db.open()
            .then(() => {
                console.log('[DB] Opened successfully. Version:', db.verno);
            })
            .catch((err) => {
                console.error('[DB] Open failed:', err);
            });
    });

    return null;
}
