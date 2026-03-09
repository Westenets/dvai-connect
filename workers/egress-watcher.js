require('dotenv').config({ path: './.env.local' });
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// 1. Initialize your S3 Client (using the config that worked for you!)
const s3Client = new S3Client({
    region: process.env.S3_REGION.trim(),
    endpoint: process.env.S3_ENDPOINT.trim(),
    credentials: {
        accessKeyId: process.env.S3_KEY_ID.trim(),
        secretAccessKey: process.env.S3_KEY_SECRET.trim(),
    },
    forcePathStyle: true, // Crucial for Linode!
});

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
        // For Production: Using lib-storage Upload for robust streaming
        const { Upload } = require('@aws-sdk/lib-storage');
        const fileStream = fs.createReadStream(filePath);

        const parallelUploads3 = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.S3_BUCKET.trim(),
                Key: `${fileOrigin}/${fileName}`,
                Body: fileStream,
                ContentType: filePath.endsWith('.mp4') ? 'video/mp4' : 'audio/ogg',
                ACL: 'public-read',
            },
            // Optional: configuration for the upload
            queueSize: 4, // Number of concurrent parts
            partSize: 5 * 1024 * 1024, // 5MB per part
            leavePartsOnError: false, // Clean up failed parts
        });

        console.log(
            `🚀 [STREAM] Uploading to Linode via lib-storage (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)...`,
        );

        parallelUploads3.on('httpUploadProgress', (progress) => {
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            process.stdout.write(`\r   - Upload progress: ${percentage}%`);
        });

        await parallelUploads3.done();
        process.stdout.write('\n');
        console.log(`✅ [SUCCESS] Streaming upload complete: ${fileName}`);

        // Construct and log the public URL
        const publicUrl = `${process.env.S3_ENDPOINT.trim()}/${process.env.S3_BUCKET.trim()}/${fileOrigin}/${fileName}`;
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
