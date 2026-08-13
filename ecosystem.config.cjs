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
      max_restarts: 100,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
    {
      name: 'textile-tunnel',
      script: path.join(root, 'scripts/run-named-tunnel.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        PORT: '3000',
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
      },
      autorestart: true,
      max_restarts: 100,
      restart_delay: 10000,
      exp_backoff_restart_delay: 2000,
    },
    {
      name: 'textile-watchdog',
      script: path.join(root, 'scripts/tunnel-watchdog.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
        WATCHDOG_INTERVAL_SEC: '45',
        WATCHDOG_FAIL_THRESHOLD: '2',
      },
      autorestart: true,
      max_restarts: 100,
      restart_delay: 15000,
    },
  ],
};
