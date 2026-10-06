import { defineConfig } from "vitest/config";

// Main-process tests run in Node; the renderer's tests live with the UI package.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
