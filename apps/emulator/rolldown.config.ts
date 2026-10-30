// One file for the container: the emulator and everything it imports
// (the shared model, yaml), with Node's own modules left out.
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/main.ts",
  platform: "node",
  output: { file: "dist/main.js", format: "esm" },
});
