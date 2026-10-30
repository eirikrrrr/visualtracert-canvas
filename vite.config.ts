import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
