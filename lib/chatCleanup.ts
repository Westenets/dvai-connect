/**
 * Chat cleanup logic based on recording state.
 *
 * Rules:
 * 1. If the meeting was NOT recorded at all → delete all chat messages + Appwrite files for that room.
 * 2. If the meeting was PARTIALLY recorded → keep only chat within the recorded timespan,
 *    delete the rest + their Appwrite files.
 */

import { db, type ChatMessage } from './db';
import { storage } from './appwrite';

const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files';

// ── Module-level recording state tracker ────────────────────────────────
// ControlBar calls these when recording starts/stops so cleanup knows the timespan.

interface RecordingSpan {
    startedAt: number;
    stoppedAt?: number;
}

const roomRecordingSpans = new Map<string, RecordingSpan[]>();

/** Call when recording starts in a room. */
export function onRecordingStarted(roomName: string) {
    if (!roomRecordingSpans.has(roomName)) {
        roomRecordingSpans.set(roomName, []);
    }
    roomRecordingSpans.get(roomName)!.push({ startedAt: Date.now() });
    console.log(`[ChatCleanup] Recording started for "${roomName}" at ${new Date().toISOString()}`);
}

/** Call when recording stops in a room. */
export function onRecordingStopped(roomName: string) {
    const spans = roomRecordingSpans.get(roomName);
    if (spans && spans.length > 0) {
        const last = spans[spans.length - 1];
        if (!last.stoppedAt) {
            last.stoppedAt = Date.now();
            console.log(`[ChatCleanup] Recording stopped for "${roomName}" at ${new Date().toISOString()}`);
        }
    }
}

/** Returns true if any recording happened in this room. */
export function wasRoomRecorded(roomName: string): boolean {
    return (roomRecordingSpans.get(roomName)?.length ?? 0) > 0;
}

/** Returns the recorded time spans for a room. */
export function getRecordingSpans(roomName: string): RecordingSpan[] {
    return roomRecordingSpans.get(roomName) || [];
}

// ── Cleanup functions ───────────────────────────────────────────────────

/**
 * Extracts Appwrite file ID from a storage URL.
 * URL format: https://<endpoint>/v1/storage/buckets/<bucketId>/files/<fileId>/view...
 */
function extractFileId(url: string): string | null {
    try {
        const match = url.match(/\/files\/([^/]+)\//);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/** Delete Appwrite files for a list of chat messages. Silently ignores failures. */
async function deleteAppwriteFiles(messages: ChatMessage[]) {
    const fileIds = messages
        .filter(m => m.media_url)
        .map(m => extractFileId(m.media_url!))
        .filter((id): id is string => !!id);

    for (const fileId of fileIds) {
        try {
            await storage.deleteFile(BUCKET_ID, fileId);
            console.log(`[ChatCleanup] Deleted file ${fileId}`);
        } catch (e) {
            // File may already be deleted or not exist
            console.warn(`[ChatCleanup] Failed to delete file ${fileId}:`, e);
        }
    }
}

/**
 * Returns true if a timestamp falls within any of the recorded spans.
 * Includes a small buffer (2 seconds) on each end for edge cases.
 */
function isWithinRecordedTime(timestamp: number, spans: RecordingSpan[]): boolean {
    const BUFFER_MS = 2000;
    return spans.some(span => {
        const start = span.startedAt - BUFFER_MS;
        const end = (span.stoppedAt ?? Date.now()) + BUFFER_MS;
        return timestamp >= start && timestamp <= end;
    });
}

/**
 * Run chat cleanup for a room after meeting ends.
 * Should be called on RoomEvent.Disconnected.
 */
export async function cleanupChatForRoom(roomName: string): Promise<void> {
    const spans = getRecordingSpans(roomName);
    const wasRecorded = spans.length > 0;

    console.log(`[ChatCleanup] Cleaning up chat for "${roomName}" (recorded: ${wasRecorded}, spans: ${spans.length})`);

    try {
        const allMessages = await db.chat_messages
            .where('room_name').equals(roomName)
            .toArray();

        if (allMessages.length === 0) {
            roomRecordingSpans.delete(roomName);
            return;
        }

        if (!wasRecorded) {
            // Case 1: NOT recorded → delete everything
            console.log(`[ChatCleanup] No recording — deleting all ${allMessages.length} chat messages.`);
            await deleteAppwriteFiles(allMessages);
            await db.chat_messages.where('room_name').equals(roomName).delete();
        } else {
            // Case 2: Partially recorded → keep only messages within recorded spans
            // Close any open spans (recording still running at disconnect)
            for (const span of spans) {
                if (!span.stoppedAt) span.stoppedAt = Date.now();
            }

            const toDelete = allMessages.filter(m => !isWithinRecordedTime(m.timestamp, spans));
            const toKeep = allMessages.length - toDelete.length;

            if (toDelete.length > 0) {
                console.log(`[ChatCleanup] Keeping ${toKeep} messages within recorded timespan, deleting ${toDelete.length} outside.`);
                await deleteAppwriteFiles(toDelete);
                const idsToDelete = toDelete.map(m => m.id).filter((id): id is number => id !== undefined);
                await db.chat_messages.bulkDelete(idsToDelete);
            } else {
                console.log(`[ChatCleanup] All ${allMessages.length} messages fall within recorded timespan.`);
            }
        }
    } catch (e) {
        console.error('[ChatCleanup] Error during cleanup:', e);
    } finally {
        // Clear tracking for this room
        roomRecordingSpans.delete(roomName);
    }
}
