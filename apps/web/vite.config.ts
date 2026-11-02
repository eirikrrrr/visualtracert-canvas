import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// one version for the whole repository, and its stage (alpha, beta, stable):
// those of its root package.json
import { stage, version } from "../../package.json";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_STAGE__: JSON.stringify(stage) },
  server: {
    port: 5180,
    // the emulator, as docker compose publishes it for development (the
    // devices' CLI is a WebSocket)
    proxy: {
      "/api": { target: "http://127.0.0.1:9161", ws: true },
    },
  },
  build: {
    // Monaco is large and loaded only with the Documento tab
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
