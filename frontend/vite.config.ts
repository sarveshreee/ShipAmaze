import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { resolveVelocityUrlsFromEnv } from "./src/lib/velocityDashboardUrls";

function logVelocityDashboardUrls(mode: string) {
  const { dashboard, warehouse } = resolveVelocityUrlsFromEnv(process.env);
  console.info(`[velocity-ui] ${mode} — merchant dashboard: ${dashboard}`);
  console.info(`[velocity-ui] ${mode} — warehouse settings (Open Velocity Dashboard): ${warehouse}`);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  logVelocityDashboardUrls(mode);

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
