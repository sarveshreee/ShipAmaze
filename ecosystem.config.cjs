/**
 * PM2 process file for VPS / self-hosted API deployment.
 * Usage (from repo root): pm2 start ecosystem.config.cjs
 * Ensure backend is built first: npm run build:backend
 */
module.exports = {
  apps: [
    {
      name: "shipamaze-api",
      cwd: "./backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      autorestart: true,
    },
  ],
};
