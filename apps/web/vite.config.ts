import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// one version for the whole repository: the one of its root package.json
import { version } from "../../package.json";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5180,
    // the emulator and the accounts service, as docker compose publishes them
    // for development (the devices' CLI is a WebSocket). Here the emulator is
    // reached directly: nginx's session check is not in between
    proxy: {
      "/api": { target: "http://127.0.0.1:9151", ws: true },
      "/auth": { target: "http://127.0.0.1:9152" },
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
