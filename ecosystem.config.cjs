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
      max_restarts: 200,
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
        CLOUDFLARE_TUNNEL_PROTOCOL: 'quic',
        TUNNEL_METRICS_PORT: '20241',
      },
      autorestart: true,
      max_restarts: 200,
      restart_delay: 3000,
      exp_backoff_restart_delay: 2000,
      // Refresh tunnel before observed ~4h idle connection drops.
      cron_restart: '0 */2 * * *',
    },
    {
      name: 'textile-tunnel-keepalive',
      script: path.join(root, 'scripts/tunnel-keepalive.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
        TUNNEL_KEEPALIVE_SEC: '30',
      },
      autorestart: true,
      max_restarts: 200,
      restart_delay: 5000,
    },
    {
      name: 'textile-watchdog',
      script: path.join(root, 'scripts/tunnel-watchdog.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
        WATCHDOG_INTERVAL_SEC: '10',
        TUNNEL_MIN_HA_CONNECTIONS: '2',
      },
      autorestart: true,
      max_restarts: 200,
      restart_delay: 5000,
    },
  ],
};
