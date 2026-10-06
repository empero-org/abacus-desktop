// Development: Vite serves the renderer with hot reload, esbuild rebuilds the
// main process and preload on change, and Electron restarts when they do.

import { context } from "esbuild";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { nodeBundles } from "./build.mjs";

const root = resolve(import.meta.dirname, "..");
const electronBinary = createRequire(import.meta.url)("electron");

const server = await createServer({ configFile: resolve(root, "vite.config.ts") });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5199/";

let electron = null;
function restartElectron() {
  if (electron) {
    electron.removeAllListeners("exit");
    electron.kill();
  }
  // Extra arguments go to the app: `pnpm dev -- ~/project` opens that folder.
  electron = spawn(electronBinary, [root, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ABACUS_DESKTOP_DEV_URL: url },
  });
  electron.on("exit", () => {
    void server.close();
    process.exit(0);
  });
}

// Stopping the dev script stops the app with it, rather than orphaning Electron.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    electron?.removeAllListeners("exit");
    electron?.kill();
    void server.close().finally(() => process.exit(0));
  });
}

let first = true;
const restartOnRebuild = {
  name: "restart-electron",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      if (first) return;
      restartElectron();
    });
  },
};

const contexts = await Promise.all(
  nodeBundles.map((options) => context({ ...options, plugins: [restartOnRebuild] })),
);
await Promise.all(contexts.map((ctx) => ctx.rebuild()));
first = false;
await Promise.all(contexts.map((ctx) => ctx.watch()));
restartElectron();
