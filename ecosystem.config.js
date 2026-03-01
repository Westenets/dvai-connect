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
      watch: true,
      // Give the app some time to properly shut down (important for closing LiveKit connections)
      kill_timeout: 5000,
      // Automatically restart if it crashes
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
