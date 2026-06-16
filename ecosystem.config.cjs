/**
 * PM2 ecosystem for the meet app on a self-hosted VPS.
 *
 * Two processes:
 *   - meet-web: the Next.js server (`next start`)
 *   - meet-cron: the in-process cron worker (workers/cron.mjs) that
 *     pings /api/cron/* endpoints on schedule
 *
 * Optional third process (the existing egress watcher) can be wired
 * here too — uncomment when you're ready to manage it via PM2 instead
 * of the standalone way you run it today.
 *
 * Usage:
 *   pnpm build                  # build Next.js first
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                    # persist across reboots
 *   pm2 logs                    # tail both processes
 *   pm2 restart all             # after a deploy
 *
 * Env vars come from .env.local automatically because both processes
 * load dotenv at startup (Next via --env-file, the cron worker via
 * `dotenv/config` import). To make this explicit you can also list
 * env vars in `env:` per process.
 */

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
        {
            name: 'meet-cron',
            script: 'workers/cron.mjs',
            cwd: __dirname,
            instances: 1, // MUST be 1 — multiple replicas would multi-fire crons
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '256M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
