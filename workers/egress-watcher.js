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
const WATCH_DIR = '/home/dvadmin/dvai-connect/livekit-recordings';

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
  console.log(`\n🎬 New recording finished rendering: ${fileName}`);

  try {
    // Read the file via a stream to keep server memory usage low
    const fileStream = fs.createReadStream(filePath);

    const uploadParams = {
      Bucket: process.env.S3_BUCKET.trim(),
      Key: `meet/${fileName}`, // Target path in your Linode bucket
      Body: fileStream,
      ContentType: filePath.endsWith('.mp4') ? 'video/mp4' : 'audio/ogg',
    };

    console.log(`🚀 Uploading to Linode Object Storage...`);
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`✅ Upload complete: ${fileName}`);

    // 4. Safely delete the local copy to save your server's disk space
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`⚠️ Failed to delete local file: ${filePath}`, err);
      } else {
        console.log(`🗑️ Deleted local file to free up space.`);
      }
    });
  } catch (err) {
    console.error(`❌ S3 Upload failed for ${fileName}:`, err);
  }
});
