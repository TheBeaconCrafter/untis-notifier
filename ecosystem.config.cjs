module.exports = {
  apps: [
    {
      name: 'untis-notifier',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      time: true,
    },
  ],
};
