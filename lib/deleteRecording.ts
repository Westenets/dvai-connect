import { databases, storage } from './appwrite';
import Swal from 'sweetalert2';
import toast from 'react-hot-toast';

const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_MEET_BUCKET_ID || 'mvc-files';

/**
 * Extracts the Appwrite file ID from a storage viewer URL.
 * Format: .../files/[fileId]/view...
 */
const getFileIdFromUrl = (url: string | undefined): string | null => {
    if (!url) return null;
    const match = url.match(/\/files\/([^/?#]+)/);
    return match ? match[1] : null;
};

interface RecordingDoc {
    $id: string;
    recording_url?: string;
    thumbnail?: string;
    started_by: string;
    [key: string]: any;
}

/**
 * Handles the deletion of a recording from Appwrite Database and Storage.
 * Includes ownership check and user confirmation.
 */
export const handleDeleteRecording = async (
    rec: RecordingDoc,
    currentUser: { $id: string } | null,
    onSuccess?: () => void
) => {
    if (!currentUser) {
        toast.error('You must be logged in to delete a recording.');
        return;
    }

    // Ownership Check
    const ownerIds = (rec as any).owner || [];
    const isOwnerByField = Array.isArray(ownerIds) && ownerIds.includes(currentUser.$id);
    
    // Legacy Check (Fallback)
    const legacyOwnerId = rec.started_by?.split('__')[1];
    const isLegacyOwner = legacyOwnerId === currentUser.$id;

    if (!isOwnerByField && !isLegacyOwner) {
        toast.error('Error: You can only delete recordings that you started.');
        return;
    }

    const result = await Swal.fire({
        title: 'Delete Recording?',
        text: 'This will permanently remove the video and thumbnail. This action cannot be undone.',
        icon: 'warning',
        theme: 'auto',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it',
        cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
        const deleteToastId = toast.loading('Deleting recording...');
        try {
            // 1. Delete files from Storage
            const recordingFileId = rec.recording_url ? getFileIdFromUrl(rec.recording_url) : null;
            const thumbnailFileId = rec.thumbnail ? getFileIdFromUrl(rec.thumbnail) : null;

            const storagePromises: Promise<any>[] = [];
            if (recordingFileId) {
                storagePromises.push(storage.deleteFile(BUCKET_ID, recordingFileId));
            }
            if (thumbnailFileId) {
                storagePromises.push(storage.deleteFile(BUCKET_ID, thumbnailFileId));
            }

            // Execute storage deletions
            if (storagePromises.length > 0) {
                await Promise.all(storagePromises);
            }

            // 2. Delete document from Database
            await databases.deleteDocument('dvai-connect', 'recordings', rec.$id);

            toast.dismiss(deleteToastId);
            toast.success('Recording deleted successfully');
            
            if (onSuccess) {
                onSuccess();
            }
        } catch (error) {
            toast.dismiss(deleteToastId);
            console.error('Failed to delete recording:', error);
            toast.error(
                error instanceof Error 
                    ? `Failed to delete: ${error.message}` 
                    : 'Failed to delete recording. You might not have permission.'
            );
        }
    }
};
