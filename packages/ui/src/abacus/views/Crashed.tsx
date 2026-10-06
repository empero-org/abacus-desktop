// The app server exited under the window. Say so, show what it last printed,
// and offer the two ways forward.

import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAbacus } from "../context.js";

export function Crashed() {
  const crash = useAbacus((state) => state.crash);
  const workspace = useAbacus((state) => state.workspace);
  const openWorkspace = useAbacus((state) => state.openWorkspace);
  const closeWorkspace = useAbacus((state) => state.closeWorkspace);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="abacus-label text-destructive">Stopped</span>
          <h2 className="text-ui-xl font-medium">abacus stopped running</h2>
          <p className="text-ui-base text-foreground-subtle">
            {crash?.code !== null && crash?.code !== undefined
              ? `The app server exited with code ${crash.code}.`
              : "The app server was terminated."}{" "}
            Your threads are saved; restarting picks up where it left off.
          </p>
        </div>
        {crash?.tail ? (
          <pre className="max-h-72 overflow-auto rounded-lg border bg-terminal-bg px-3 py-2.5 font-mono text-ui-sm leading-relaxed whitespace-pre-wrap text-terminal-fg">
            {crash.tail}
          </pre>
        ) : null}
        <div className="flex gap-2">
          {workspace ? (
            <Button
              size="lg"
              className="gap-2"
              onClick={() => void openWorkspace(workspace.workspace)}
            >
              <RotateCcwIcon className="size-4" />
              Restart
            </Button>
          ) : null}
          <Button size="lg" variant="outline" onClick={() => void closeWorkspace()}>
            Close project
          </Button>
        </div>
      </div>
    </div>
  );
}
