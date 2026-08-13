const path = require('path');

const root = path.resolve(__dirname);

// Production: app via PM2 + Cloudflare tunnel via official system service.
// Run: bash scripts/install-cloudflared-service.sh (once) for the tunnel.
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
  ],
};
