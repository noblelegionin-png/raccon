module.exports = {
  apps: [
    {
      name: 'rocket-bot',
      script: 'src/index.js',
      cwd: 'd:\\nero-labs-telegram-bot',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 2000,
      max_memory_restart: '350M',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'rocket-tunnel',
      script: 'd:\\nero-labs-telegram-bot\\cloudflared.exe',
      args: 'tunnel --url http://localhost:3001',
      cwd: 'd:\\nero-labs-telegram-bot',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 3000,
      watch: false,
    },
  ],
};
