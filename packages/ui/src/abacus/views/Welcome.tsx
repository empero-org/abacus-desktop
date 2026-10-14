// No workspace yet: open a project folder, or pick a recent one. When the CLI
// is missing or too old, say exactly what to run, since nothing works without it.

import { FolderOpenIcon, FolderIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAbacus } from "../context.js";
import { relativeTime } from "../format.js";
import { BrandMark } from "./BrandMark.js";

// `--cli`: the app is already here, so the installer need not ask about it.
const INSTALL_COMMAND = "curl -fsSL https://abacus.empero.org/install.sh | sh -s -- --cli";
/** For PowerShell; the installer reads the choice from the environment there. */
const WINDOWS_INSTALL_COMMAND =
  '$env:ABACUS_INSTALL="cli"; irm https://abacus.empero.org/install.ps1 | iex';

export function Welcome() {
  const cli = useAbacus((state) => state.cli);
  const recent = useAbacus((state) => state.recent);
  const pickAndOpen = useAbacus((state) => state.pickAndOpen);
  const openWorkspace = useAbacus((state) => state.openWorkspace);
  const forgetWorkspace = useAbacus((state) => state.forgetWorkspace);
  const ready = cli?.state === "ready";

  return (
    <div className="flex h-full flex-col">
      <div className="app-drag h-[var(--app-chrome-height)] shrink-0" />
      <main className="abacus-glow flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pt-[12vh] pb-12">
        <div className="flex w-full max-w-xl flex-col gap-10">
          <header className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <BrandMark className="size-7 text-foreground" />
              <span className="text-[22px] font-medium tracking-tight">abacus</span>
              <span className="abacus-label rounded-sm border border-brand/40 px-1.5 py-1 text-brand">
                desktop
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-[34px] leading-[1.1] font-medium tracking-[-0.03em] text-balance">
                What are we building <span className="text-brand">today?</span>
              </h1>
              <p className="text-ui-lg text-foreground-subtle">
                Open a project folder and Abacus works in it: reading, changing and running your
                code, asking before anything it should not do on its own.
              </p>
            </div>
          </header>

          {cli && cli.state !== "ready" ? <CliNotice /> : null}

          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={() => void pickAndOpen()}
              disabled={!ready}
              className="gap-2"
            >
              <FolderOpenIcon className="size-4" />
              Open a project
            </Button>
          </div>

          {recent.length > 0 ? (
            <section className="flex flex-col gap-3">
              <span className="abacus-label">Recent projects</span>
              <ul className="flex flex-col overflow-hidden rounded-lg border bg-card">
                {recent.map((workspace) => (
                  <li
                    key={workspace.path}
                    className="group flex items-center border-b last:border-b-0"
                  >
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => void openWorkspace(workspace.path)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-50"
                    >
                      <FolderIcon className="size-4 shrink-0 text-foreground-subtlest" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-ui-base font-medium">{workspace.name}</span>
                        <span className="truncate font-mono text-ui-sm text-foreground-subtlest">
                          {workspace.path}
                        </span>
                      </span>
                      <span className="shrink-0 text-ui-sm text-foreground-subtlest">
                        {relativeTime(workspace.openedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void forgetWorkspace(workspace.path)}
                      className="mr-2 rounded p-1.5 text-foreground-subtlest opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-foreground"
                      aria-label={`Remove ${workspace.name} from recent projects`}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function CliNotice() {
  const cli = useAbacus((state) => state.cli);
  const refreshCli = useAbacus((state) => state.refreshCli);
  const windows = useAbacus((state) => state.appInfo?.platform === "win32");
  if (!cli || cli.state === "ready") return null;
  const outdated = cli.state === "outdated";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-card p-4">
      <div className="flex flex-col gap-1">
        <span className="text-ui-base font-medium">
          {outdated
            ? `Abacus ${cli.version} is too old for this app`
            : "The abacus CLI is not installed"}
        </span>
        <span className="text-ui-base text-foreground-subtle">
          {outdated
            ? `The desktop app needs abacus ${cli.minimum} or newer. Install the latest version, then check again.`
            : "The desktop app drives the abacus command-line agent. Install it, then check again."}
        </span>
      </div>
      <span className="text-ui-sm text-foreground-subtle">
        {windows ? "In PowerShell:" : "In a terminal:"}
      </span>
      <code className="-mt-2 block overflow-x-auto rounded-md bg-terminal-bg px-3 py-2 font-mono text-ui-sm text-terminal-fg select-text">
        {windows ? WINDOWS_INSTALL_COMMAND : INSTALL_COMMAND}
      </code>
      <div>
        <Button variant="outline" size="sm" onClick={() => void refreshCli()} className="gap-2">
          <RefreshCwIcon className="size-3.5" />
          Check again
        </Button>
      </div>
    </section>
  );
}
