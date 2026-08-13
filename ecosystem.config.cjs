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
      min_uptime: '30s',
    },
    {
      name: 'textile-tunnel',
      script: path.join(root, 'scripts/run-named-tunnel.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        PORT: '3000',
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
        TUNNEL_METRICS_PORT: '20241',
        CLOUDFLARE_TUNNEL_PROTOCOL: 'http2',
        TUNNEL_MIN_HA_CONNECTIONS: '4',
        TUNNEL_CHECK_INTERVAL_SEC: '5',
      },
      autorestart: true,
      max_restarts: 500,
      restart_delay: 2000,
      min_uptime: '10s',
      exp_backoff_restart_delay: 1000,
    },
    {
      name: 'textile-tunnel-guard',
      script: path.join(root, 'scripts/tunnel-guard-loop.sh'),
      interpreter: 'bash',
      cwd: root,
      env: {
        ERP_PUBLIC_URL: 'https://erp.kutalimzhda.com',
        TUNNEL_GUARD_INTERVAL_SEC: '10',
      },
      autorestart: true,
      max_restarts: 500,
      restart_delay: 3000,
      min_uptime: '10s',
    },
  ],
};
