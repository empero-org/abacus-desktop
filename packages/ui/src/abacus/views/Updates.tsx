// Updating abacus from the window: `abacus update --check` says whether a
// newer release exists, and Update runs `abacus update` in a terminal, so the
// installer can ask for the password a system package needs. It updates the
// CLI, and this app when the installer put it there.

import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useAbacus } from "../context.js";
import { TerminalView } from "./TerminalPane.js";

type UpdateState =
  | { kind: "idle"; checked: string | null }
  | { kind: "checking" }
  | { kind: "running" }
  | { kind: "done"; code: number | null };

/** The About section's Updates row, and the update's terminal once it runs. */
export function Updates() {
  const refreshCli = useAbacus((state) => state.refreshCli);
  const available = useAbacus((state) => state.updates);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle", checked: null });
  // Each Update is a terminal of its own; one that finished does not start again.
  const [runs, setRuns] = useState(0);
  const busy = update.kind === "checking" || update.kind === "running";

  const check = async () => {
    if (!window.abacus) return;
    setUpdate({ kind: "checking" });
    setUpdate({ kind: "idle", checked: await window.abacus.checkForUpdate() });
  };
  const finished = (code: number | null) => {
    setUpdate({ kind: "done", code });
    void refreshCli();
  };

  const out = [
    available?.desktop ? `Abacus desktop ${available.desktop.latest}` : null,
    available?.cli ? `abacus ${available.cli.latest}` : null,
  ].filter(Boolean);
  const hint =
    update.kind === "idle"
      ? (update.checked ??
        (out.length > 0
          ? `${out.join(" and ")} ${out.length > 1 ? "are" : "is"} out. Update installs ${out.length > 1 ? "them" : "it"}.`
          : "Runs abacus update: the CLI, and this app if the installer put it here."))
      : update.kind === "checking"
        ? "Checking…"
        : update.kind === "running"
          ? "Updating… it may ask for your password to update the app's package."
          : update.code === 0
            ? "Updated. Restart Abacus to use the new version."
            : "The update did not finish; its output is below.";

  return (
    <>
      <div className="flex items-center gap-6 px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-ui-base">Updates</span>
          <span className="text-ui-sm text-foreground-subtlest">{hint}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void check()}>
            Check
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setRuns(runs + 1);
              setUpdate({ kind: "running" });
            }}
          >
            Update
          </Button>
        </div>
      </div>
      {update.kind === "running" || update.kind === "done" ? (
        <div className="relative h-56 bg-terminal-bg">
          <TerminalView key={runs} visible run="update" onExit={finished} />
        </div>
      ) : null}
    </>
  );
}
