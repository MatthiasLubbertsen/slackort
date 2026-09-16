import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Dashboard is a static SPA built to dist/ and served by src/web/server.ts
// on WEB_PORT. In dev, proxy /api to the stats API server so `npm run dev`
// here works against a real running Hestia instance on API_PORT.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:7778", changeOrigin: true },
    },
  },
});
