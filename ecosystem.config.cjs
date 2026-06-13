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
            name: 'meet-web',
            script: 'node_modules/next/dist/bin/next',
            args: 'start --port 3000',
            cwd: __dirname,
            instances: 1, // raise for horizontal scaling, but the cron
            // worker should remain instances:1 (it has its own process)
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '2G',
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
        // Uncomment when ready to put the egress watcher under PM2 too:
        // {
        //     name: 'meet-egress-watcher',
        //     script: 'workers/egress-watcher.js',
        //     cwd: __dirname,
        //     instances: 1,
        //     exec_mode: 'fork',
        //     autorestart: true,
        //     max_memory_restart: '512M',
        //     env: { NODE_ENV: 'production' },
        // },
    ],
};
