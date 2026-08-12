const path = require('path');

const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: 'textile-erp',
      script: path.join(root, 'scripts/run-server.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
    {
      name: 'textile-tunnel',
      script: path.join(root, 'scripts/run-tunnel.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        PORT: '3000',
      },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000,
      exp_backoff_restart_delay: 2000,
    },
  ],
};
