module.exports = {
  apps: [
    {
      name: 'freenode-dashboard',
      script: 'server.js',
      instances: 1,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
