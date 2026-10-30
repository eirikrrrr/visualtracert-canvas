import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// one version for the whole repository: the one of its root package.json
import { version } from "../../package.json";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5180 },
  build: {
    // Monaco is large and loaded only with the Documento tab
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
