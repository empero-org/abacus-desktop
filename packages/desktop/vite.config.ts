import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ui = resolve(import.meta.dirname, "../ui/src");

// The renderer is the shared UI package mounted in a window. Its "@/..."
// imports resolve into packages/ui/src, as they did in the code it came from.
export default defineConfig({
  root: resolve(import.meta.dirname, "src/renderer"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": ui },
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5199, strictPort: true },
  build: {
    outDir: resolve(import.meta.dirname, "out/renderer"),
    emptyOutDir: true,
    target: "chrome140",
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
  },
});
