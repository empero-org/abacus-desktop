// The window: boot, pick a workspace, then the workspace view. Everything the
// views show comes from the store; this component only decides which screen.

import { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { AbacusStoreProvider, useAbacus } from "./context.js";
import { createAbacusStore } from "./store.js";
import { useColorScheme } from "./useColorScheme.js";
import { Notices } from "./views/Notices.js";
import { Welcome } from "./views/Welcome.js";
import { Workspace } from "./views/Workspace.js";
import { BrandMark } from "./views/BrandMark.js";

export function AbacusApp() {
  const bridge = typeof window === "undefined" ? undefined : window.abacus;
  const store = useMemo(() => (bridge ? createAbacusStore(bridge) : null), [bridge]);
  useColorScheme();

  if (!store) return <NoBridge />;
  return (
    <TooltipProvider delayDuration={300}>
      <AbacusStoreProvider store={store}>
        <Screens />
        <Notices />
      </AbacusStoreProvider>
    </TooltipProvider>
  );
}

function Screens() {
  const phase = useAbacus((state) => state.phase);
  const boot = useAbacus((state) => state.boot);
  const [bootError, setBootError] = useState<string | null>(null);

  // A file dropped anywhere but the composer is ignored, rather than Chromium
  // trying to open it in place of the app.
  useEffect(() => {
    const ignore = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", ignore);
    window.addEventListener("drop", ignore);
    return () => {
      window.removeEventListener("dragover", ignore);
      window.removeEventListener("drop", ignore);
    };
  }, []);

  useEffect(() => {
    boot().catch((error: unknown) =>
      setBootError(error instanceof Error ? error.message : String(error)),
    );
  }, [boot]);

  const cliReady = useAbacus((state) => state.cli?.state === "ready");
  if (bootError) return <Splash detail={bootError} />;
  if (phase === "booting") return <Splash />;
  // Nothing works without the CLI: until it is installed, that is the whole window.
  if (!cliReady && phase === "welcome") return <Welcome />;
  return <Workspace />;
}

function Splash({ detail }: { detail?: string }) {
  return (
    <div className="app-drag abacus-glow flex h-full flex-col items-center justify-center gap-4">
      <BrandMark className="size-9 text-foreground" />
      {detail ? (
        <p className="max-w-md text-center text-ui-base text-destructive">{detail}</p>
      ) : null}
    </div>
  );
}

/** The renderer opened outside Electron (a browser on the Vite dev server). */
function NoBridge() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <BrandMark className="size-9 text-foreground" />
      <p className="text-ui-base text-foreground-subtle">
        This page is the Abacus desktop window. Open it with `pnpm dev`.
      </p>
    </div>
  );
}
