// The window once abacus is installed: projects and sessions on the left; in
// the middle the open thread, settings, or the start page when no project is
// open, with the terminal pane beneath; the turn's changed files on the right
// when asked for.

import { useEffect, useState } from "react";
import { cn } from "@/components/lib/utils.js";
import { useAbacus } from "../context.js";
import { BrowserPane, useBrowserPane } from "./BrowserPane.js";
import { ChangesPane } from "./ChangesPane.js";
import { Composer } from "./Composer.js";
import { Conversation } from "./Conversation.js";
import { Crashed } from "./Crashed.js";
import { Home } from "./Home.js";
import { Settings } from "./Settings.js";
import { Sidebar } from "./Sidebar.js";
import { TasksPanel, useTasksPanel } from "./TasksPanel.js";
import { TerminalPane } from "./TerminalPane.js";
import { TopBar } from "./TopBar.js";

export function Workspace() {
  const phase = useAbacus((state) => state.phase);
  const view = useAbacus((state) => state.view);
  const emptyThread = useAbacus(
    (state) => state.thread !== null && state.thread.items.length === 0 && !state.thread.turnId,
  );
  const platform = useAbacus((state) => state.appInfo?.platform);
  const changedFiles = useAbacus((state) => state.thread?.changedFiles.length ?? 0);
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const hasTasks = useAbacus(
    (state) => Boolean(state.capabilities.tasks) && state.tasks.length > 0,
  );
  const tasks = useTasksPanel();
  const browser = useBrowserPane();
  const [changesOpen, setChangesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  // Mounted on first open and kept, hidden, after: closing the pane must not
  // kill the shells in it.
  const [terminalUsed, setTerminalUsed] = useState(false);
  const terminalAvailable = phase === "ready" && workspace !== null;
  const toggleTerminal = () => {
    setTerminalUsed(true);
    setTerminalOpen((open) => !open);
  };

  // Ctrl+` shows and hides the terminal, as in most editors.
  useEffect(() => {
    if (!terminalAvailable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Backquote") {
        event.preventDefault();
        setTerminalUsed(true);
        setTerminalOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [terminalAvailable]);

  // Leaving the project leaves its terminals; the next one starts new shells.
  useEffect(() => {
    setTerminalUsed((used) => used && workspace !== null);
    if (workspace === null) setTerminalOpen(false);
  }, [workspace]);

  // The kit's platform variants (title-bar safe areas) key off these classes.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("platform-mac-desktop", platform === "darwin");
    root.classList.toggle("platform-windows-desktop", platform === "win32");
    root.classList.toggle("platform-linux-desktop", platform === "linux");
  }, [platform]);

  // A turn that changed files offers its changes without forcing the pane open.
  useEffect(() => {
    if (changedFiles === 0) setChangesOpen(false);
  }, [changedFiles]);

  return (
    <div className="flex h-full">
      {sidebarOpen ? <Sidebar platform={platform} /> : null}
      {/* The start pages' glow spans the top bar too, so it has no seam. */}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col",
          view === "chat" &&
            (phase === "welcome" || (phase === "ready" && emptyThread)) &&
            "abacus-glow",
        )}
      >
        <TopBar
          platform={platform}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          changesOpen={changesOpen}
          onToggleChanges={() => setChangesOpen((open) => !open)}
          terminalOpen={terminalOpen}
          onToggleTerminal={terminalAvailable ? toggleTerminal : undefined}
          tasksOpen={tasks.open}
          tasksRunning={tasks.running}
          onToggleTasks={hasTasks || tasks.open ? () => tasks.setOpen(!tasks.open) : undefined}
          browserOpen={browser.open}
          onToggleBrowser={phase === "ready" ? () => browser.setOpen(!browser.open) : undefined}
        />
        {tasks.open && phase === "ready" ? (
          <TasksPanel
            expanded={tasks.expanded}
            onExpandedChange={tasks.setExpanded}
            onClose={() => tasks.setOpen(false)}
          />
        ) : null}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col")}>
              {view === "settings" ? (
                <Settings />
              ) : phase === "welcome" ? (
                <Home />
              ) : phase === "crashed" ? (
                <Crashed />
              ) : phase === "connecting" ? (
                <Connecting />
              ) : (
                <>
                  <Conversation />
                  <Composer />
                </>
              )}
            </main>
            {terminalUsed && workspace ? (
              <TerminalPane
                key={workspace}
                open={terminalOpen && view === "chat"}
                onClose={() => setTerminalOpen(false)}
              />
            ) : null}
          </div>
          {changesOpen && phase === "ready" && view === "chat" ? (
            <ChangesPane onClose={() => setChangesOpen(false)} />
          ) : null}
          {browser.open && phase === "ready" && view === "chat" ? (
            <BrowserPane
              expanded={browser.expanded}
              covered={tasks.open}
              onExpandedChange={browser.setExpanded}
              onClose={() => browser.setOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Connecting() {
  const workspace = useAbacus((state) => state.workspace);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-foreground-subtle">
      <span className="size-2 animate-pulse rounded-full bg-brand" />
      <span className="text-ui-base">
        Starting abacus{workspace ? ` in ${workspace.name}` : ""}…
      </span>
    </div>
  );
}
