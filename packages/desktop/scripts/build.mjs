// Production build: the main process and preload bundled with esbuild, the
// renderer with Vite. Everything lands in out/, which is all electron-builder
// packs; the app ships no node_modules.

import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

export const nodeBundles = [
  {
    entryPoints: [resolve(root, "src/main/index.ts")],
    outfile: resolve(root, "out/main/index.cjs"),
  },
  {
    entryPoints: [resolve(root, "src/preload/index.ts")],
    outfile: resolve(root, "out/preload/index.cjs"),
  },
].map((bundle) => ({
  ...bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  // node-pty is native: it loads from node_modules at run time, never bundled.
  external: ["electron", "@lydell/node-pty"],
  sourcemap: true,
  logLevel: "warning",
}));

async function main() {
  await Promise.all(nodeBundles.map((options) => build(options)));
  await viteBuild({ configFile: resolve(root, "vite.config.ts"), logLevel: "warn" });
  console.log("built out/main, out/preload, out/renderer");
}

// Run directly, not imported by dev.mjs. As a URL: on Windows the path has
// backslashes and a drive letter, and `file://` + path never matches.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
