import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useRoomContext } from '@livekit/components-react';

export function useMeetingIntelligence(explicitRoomName?: string, batchSize = 100) {
    let room: any;
    try {
        room = useRoomContext();
    } catch (e) {
        // Not in LiveKitRoom context, that's fine for post-meeting fallback
    }
    const roomName = explicitRoomName || room?.name;
    const workerRef = useRef<Worker | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const processingRef = useRef(false);

    // Initialize worker
    useEffect(() => {
        if (!roomName) return;
        
        // Next.js standard way to import workers
        workerRef.current = new Worker(new URL('../workers/intelligence.worker.ts', import.meta.url), { type: 'module' });
        
        workerRef.current.onmessage = (e) => {
            const { status, endId, error } = e.data;
            if (status === 'SUCCESS' || status === 'ERROR') {
                if (status === 'ERROR') console.error('Intelligence Worker Error:', error);
                setIsProcessing(false);
                processingRef.current = false;
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, [roomName]);

    const processingTracker = useLiveQuery(
        async () => roomName ? await db.processing_tracker.where('room_name').equals(roomName).first() : undefined,
        [roomName]
    );

    const latestTranscript = useLiveQuery(
        async () => roomName ? await db.transcripts.where('room_name').equals(roomName).last() : undefined,
        [roomName]
    );

    useEffect(() => {
        if (!roomName || !latestTranscript || processingRef.current) return;

        const lastProcessedId = processingTracker?.lastProcessedId || 0;
        const currentMaxId = latestTranscript.id || 0;
        
        // If we have accumulated enough chunks, trigger worker
        if (currentMaxId - lastProcessedId >= batchSize) {
            triggerProcessing(lastProcessedId, currentMaxId);
        }
    }, [latestTranscript, processingTracker, roomName, batchSize]);

    // Handle meeting end - flush remaining chunks
    useEffect(() => {
        const handleDisconnect = () => {
            if (roomName && !processingRef.current) {
                flushRemaining();
            }
        };
        
        if (room) {
            // LiveKit disconnected event
            room.on('disconnected', handleDisconnect);
        }
        return () => {
            room?.off('disconnected', handleDisconnect);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, roomName]);

    const triggerProcessing = (startId: number, endId: number) => {
        if (!workerRef.current || processingRef.current || !roomName) return;
        
        setIsProcessing(true);
        processingRef.current = true;
        
        workerRef.current.postMessage({
            action: 'PROCESS_BATCH',
            roomName,
            startId,
            endId
        });
    };

    const flushRemaining = async () => {
        if (!roomName || processingRef.current) return;
        try {
            const tracker = await db.processing_tracker.where('room_name').equals(roomName).first();
            const lastProcessedId = tracker?.lastProcessedId || 0;
            const latest = await db.transcripts.where('room_name').equals(roomName).last();
            const currentMaxId = latest?.id || 0;
            
            if (currentMaxId > lastProcessedId) {
                triggerProcessing(lastProcessedId, currentMaxId);
            }
        } catch (e) {
            console.error('Failed to flush remaining transcripts:', e);
        }
    };

    // Return a manual flush function and processing state
    return {
        isProcessing,
        flushRemaining
    };
}
