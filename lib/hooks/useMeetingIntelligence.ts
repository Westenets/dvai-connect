import { useEffect, useRef, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useRoomContext } from '@livekit/components-react';

export type PipelineStatus = 'idle' | 'running' | 'complete' | 'error';

export function useMeetingIntelligence(explicitRoomName?: string, batchSize = 100) {
    let room: any;
    try {
        room = useRoomContext();
    } catch (e) {
        // Not in LiveKitRoom context, that's fine for post-meeting fallback
    }
    const roomName = explicitRoomName || room?.name;
    const [isProcessing, setIsProcessing] = useState(false);
    const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('idle');
    const [pipelineMessage, setPipelineMessage] = useState('');
    const processingRef = useRef(false);

    const processingTracker = useLiveQuery(
        async () => roomName ? await db.processing_tracker.where('room_name').equals(roomName).first() : undefined,
        [roomName]
    );

    const latestTranscript = useLiveQuery(
        async () => roomName ? await db.transcripts.where('room_name').equals(roomName).last() : undefined,
        [roomName]
    );

    // Auto-trigger batch processing during live meetings
    useEffect(() => {
        if (!roomName || !latestTranscript || processingRef.current) return;

        const lastProcessedId = processingTracker?.lastProcessedId || 0;
        const currentMaxId = latestTranscript.id || 0;

        if (currentMaxId - lastProcessedId >= batchSize) {
            triggerProcessing(lastProcessedId, currentMaxId);
        }
    }, [latestTranscript, processingTracker, roomName, batchSize]);

    useEffect(() => {
        const handleDisconnect = () => {
            if (roomName && !processingRef.current) {
                flushRemaining();
            }
        };

        if (room) {
            room.on('disconnected', handleDisconnect);
        }
        return () => {
            room?.off('disconnected', handleDisconnect);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, roomName]);

    const triggerProcessing = async (startId: number, endId: number) => {
        if (processingRef.current || !roomName) return;

        setIsProcessing(true);
        processingRef.current = true;

        try {
            const { processBatch } = await import('../intelligencePipeline');
            await processBatch(roomName, startId, endId);
        } catch (err: any) {
            console.error('[Intelligence] processing error:', err);
        } finally {
            setIsProcessing(false);
            processingRef.current = false;
        }
    };

    const flushRemaining = async () => {
        if (!roomName || processingRef.current) return;
        try {
            const tracker = await db.processing_tracker.where('room_name').equals(roomName).first();
            const lastProcessedId = tracker?.lastProcessedId || 0;
            const latest = await db.transcripts.where('room_name').equals(roomName).last();
            const currentMaxId = latest?.id || 0;

            if (currentMaxId > lastProcessedId) {
                await triggerProcessing(lastProcessedId, currentMaxId);
            }
        } catch (e) {
            console.error('Failed to flush remaining transcripts:', e);
        }
    };

    /**
     * Run the full pipeline for the room (post-meeting).
     * Survives component unmounts — the module-level promise keeps running.
     * Updates local React state for UI feedback.
     */
    const runPipeline = useCallback(async () => {
        if (!roomName) return;

        setPipelineStatus('running');
        setPipelineMessage('Processing meeting transcript locally... This may take a few minutes. Please don\'t close this window.');

        try {
            const { runFullPipelineForRoom } = await import('../intelligencePipeline');
            await runFullPipelineForRoom(roomName);
            setPipelineStatus('complete');
            setPipelineMessage('');
        } catch (err: any) {
            console.error('[Intelligence] pipeline error:', err);
            setPipelineStatus('error');
            setPipelineMessage(`Pipeline failed: ${err.message}`);
        }
    }, [roomName]);

    return {
        isProcessing,
        flushRemaining,
        pipelineStatus,
        pipelineMessage,
        runPipeline,
    };
}
