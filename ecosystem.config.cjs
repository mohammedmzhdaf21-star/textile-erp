const path = require('path');

const root = path.resolve(__dirname);

// Production stack: app + Cloudflare named tunnel only.
// The domain (erp.kutalimzhda.com) is permanent via Cloudflare DNS → named tunnel.
// PM2 autorestart handles crashes; cloudflared reconnects to Cloudflare edge on its own.
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
      },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      min_uptime: '60s',
    },
  ],
};
