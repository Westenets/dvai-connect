module.exports = {
  apps: [
    {
      name: 'DVAI-connect',
      cwd: '/home/dvadmin/dvai-connect/',
      // Alternatively, if PM2 has trouble finding pnpm in the PATH,
      // you can point directly to the node executable:
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env_production: {
        NODE_ENV: 'production',
      },
      time: true,
      watch: false,
      // Give the app some time to properly shut down (important for closing LiveKit connections)
      kill_timeout: 5000,
      // Automatically restart if it crashes
      autorestart: true,
      max_restarts: 10,
    },
    {
      // 2. The new Egress S3 Watcher
      name: 'egress-s3-uploader',
      cwd: '/home/dvadmin/dvai-connect/',
      script: './workers/egress-watcher.js',
      instances: 1, // Only ever run ONE instance of this, or they will fight over the same file
      autorestart: true,
      watch: false, // PM2 should NOT watch for file changes, chokidar handles that
      max_memory_restart: '200M', // Keep it lightweight
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
