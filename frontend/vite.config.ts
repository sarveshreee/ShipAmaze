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
    // Allow ngrok tunnel hostnames (Vite blocks unknown Host headers by default)
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io", ".ngrok.app"],
    // Same-origin /api so ngrok HTTPS can reach the local backend (avoids localhost + mixed content)
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    {
      name: "api-preconnect",
      transformIndexHtml(html) {
        const raw = process.env.VITE_API_BASE_URL?.trim();
        if (!raw) return html;
        try {
          const origin = new URL(raw.replace(/\/api\/?$/i, "")).origin;
          const tags = `<link rel="preconnect" href="${origin}" crossorigin /><link rel="dns-prefetch" href="${origin}" />`;
          return html.replace("</head>", `${tags}</head>`);
        } catch {
          return html;
        }
      },
    },
  ],
  build: {
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-toast", "@radix-ui/react-tooltip"],
          charts: ["recharts"],
          documents: ["jspdf", "html2canvas", "jsbarcode"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
