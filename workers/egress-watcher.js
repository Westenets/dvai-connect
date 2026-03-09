require('dotenv').config({ path: './.env.local' });
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const {
    Client: AppwriteClient,
    Storage: AppwriteStorage,
    InputFile,
    ID,
} = require('node-appwrite');

// 1. Initialize Appwrite Client
const client = new AppwriteClient()
    .setEndpoint((process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '').trim())
    .setProject((process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '').trim())
    .setKey((process.env.APPWRITE_API_KEY || '').trim());

const storage = new AppwriteStorage(client);
const BUCKET_ID = (process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files').trim();

// The bridge directory you created in your home folder
const WATCH_DIR =
    process.env.NODE_ENV === 'production'
        ? '/home/dvadmin/dvai-connect/livekit-recordings'
        : 'D:\\Docs\\Personal\\Projects\\Node.JS\\Projects\\meet\\livekit-recordings';

// 2. Configure Chokidar File Watcher
const watcher = chokidar.watch(WATCH_DIR, {
    ignored: /(^|[\/\\])\../, // Ignore hidden files
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 4000, // Wait 4 seconds after the file stops growing
        pollInterval: 500, // Check the file size every 500ms
    },
});

console.log(`👀 Watching for new LiveKit recordings in: ${WATCH_DIR}`);

// 3. Listen for new files
watcher.on('add', async (filePath) => {
    // Only process video/audio files to prevent accidental uploads
    if (!filePath.endsWith('.mp4') && !filePath.endsWith('.ogg')) return;

    const fileName = path.basename(filePath);
    const fileOrigin = filePath.endsWith('.mp4') ? 'meet' : 'call';
    console.log(`\n🎬 New recording finished rendering: ${fileName}`);

    try {
        const fileStats = fs.statSync(filePath);
        if (fileStats.size === 0) {
            console.log(`File is empty: ${filePath}`);
            return;
        }

        console.log(
            `🚀 [UPLOAD] Uploading to Appwrite Storage (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)...`,
        );

        // For Appwrite, we'll use the fileName as the fileId (cleansed) if possible
        // or just a unique ID. To stay deterministic for the Stop API, let's use fileName
        // which matches what the Stop API will look for.
        // Appwrite fileId allows alphanumeric, underscore, hyphen, and period.
        const fileId = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

        const result = await storage.createFile(
            BUCKET_ID,
            fileId,
            InputFile.fromPath(filePath, fileName),
        );

        console.log(`✅ [SUCCESS] Appwrite upload complete: ${fileName} ($id: ${result.$id})`);

        // Construct and log the public URL
        const publicUrl = `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${result.$id}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`;
        console.log(`🔗 Public URL: ${publicUrl}`);

        // 4. Safely delete the local copy to save your server's disk space
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`⚠️ Failed to delete local file: ${filePath}`, err);
            } else {
                console.log(`🗑️ Deleted local file: ${fileName}`);

                // Also cleanup corresponding JSON file
                try {
                    const files = fs.readdirSync(WATCH_DIR);
                    const jsonFiles = files.filter((f) => f.endsWith('.json'));

                    for (const jsonFile of jsonFiles) {
                        const jsonPath = path.join(WATCH_DIR, jsonFile);
                        try {
                            const content = fs.readFileSync(jsonPath, 'utf8');
                            const data = JSON.parse(content);

                            // Check if any file in the metadata matches the current filename
                            const matches =
                                data.files &&
                                data.files.some(
                                    (f) =>
                                        f.filename.endsWith(fileName) ||
                                        f.location.endsWith(fileName),
                                );

                            if (matches) {
                                fs.unlinkSync(jsonPath);
                                console.log(`🗑️ Deleted associated metadata: ${jsonFile}`);
                            }
                        } catch (err) {
                            // Ignore parse/read errors for unrelated JSONs
                        }
                    }
                } catch (err) {
                    console.error(`⚠️ Failed to scan for metadata files:`, err);
                }
            }
        });
    } catch (err) {
        console.error(`❌ S3 Upload failed for ${fileName}:`, err);
    }
});
