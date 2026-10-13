// The strip above the conversation: it is the window's drag handle, names the
// thread (click to rename), and carries the context meter and the changes
// toggle. On Windows and Linux the native caption buttons overlay its right end.

import { useEffect, useRef, useState } from "react";
import { BotIcon, FileDiffIcon, GlobeIcon, PanelLeftIcon, SquareTerminalIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import { compactNumber, contextShare } from "../format.js";

export function TopBar({
  platform,
  sidebarOpen,
  onToggleSidebar,
  changesOpen,
  onToggleChanges,
  terminalOpen,
  onToggleTerminal,
  tasksOpen,
  tasksRunning,
  onToggleTasks,
  browserOpen,
  onToggleBrowser,
}: {
  platform: string | undefined;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  changesOpen: boolean;
  onToggleChanges: () => void;
  terminalOpen: boolean;
  /** Absent when there is no project to open a terminal in. */
  onToggleTerminal?: () => void;
  tasksOpen: boolean;
  tasksRunning: number;
  /** Absent until the agent has started any background work. */
  onToggleTasks?: () => void;
  browserOpen: boolean;
  /** Absent without an open project. */
  onToggleBrowser?: () => void;
}) {
  const thread = useAbacus((state) => state.thread);
  const ready = useAbacus((state) => state.phase === "ready" && state.view === "chat");
  const changed = thread?.changedFiles ?? [];
  const added = changed.reduce((sum, file) => sum + (file.added ?? 0), 0);
  const removed = changed.reduce((sum, file) => sum + (file.removed ?? 0), 0);

  return (
    <header
      className={cn(
        "app-drag flex h-[var(--app-chrome-height)] shrink-0 items-center gap-2 px-3",
        !sidebarOpen && platform === "darwin" && "pl-[84px]",
        platform !== "darwin" && "pr-[148px]",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <PanelLeftIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        </TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        {thread && ready ? <ThreadTitle key={thread.threadId} /> : null}
      </div>

      {thread && ready ? (
        <ContextMeter tokensUsed={thread.tokensUsed} contextWindow={thread.contextWindow} />
      ) : null}

      {onToggleTasks ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleTasks}
              aria-pressed={tasksOpen}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground",
                tasksOpen && "bg-selected text-foreground",
              )}
              aria-label="Background tasks"
            >
              <BotIcon className="size-4" />
              {tasksRunning > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] leading-none text-primary-foreground">
                  {tasksRunning}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Background tasks{tasksRunning > 0 ? ` · ${tasksRunning} running` : ""}
          </TooltipContent>
        </Tooltip>
      ) : null}

      {onToggleBrowser ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleBrowser}
              aria-pressed={browserOpen}
              className={cn(
                "rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground",
                browserOpen && "bg-selected text-foreground",
              )}
              aria-label={browserOpen ? "Hide browser" : "Show browser"}
            >
              <GlobeIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{browserOpen ? "Hide browser" : "Browser"}</TooltipContent>
        </Tooltip>
      ) : null}

      {onToggleTerminal ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleTerminal}
              aria-pressed={terminalOpen}
              className={cn(
                "rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground",
                terminalOpen && "bg-selected text-foreground",
              )}
              aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
            >
              <SquareTerminalIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {terminalOpen ? "Hide terminal" : "Terminal"} (Ctrl+`)
          </TooltipContent>
        </Tooltip>
      ) : null}

      {changed.length > 0 ? (
        <button
          type="button"
          onClick={onToggleChanges}
          aria-pressed={changesOpen}
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground",
            changesOpen && "border-brand/50 bg-selected text-foreground",
          )}
        >
          <FileDiffIcon className="size-3.5" />
          <span>
            {changed.length} {changed.length === 1 ? "file" : "files"}
          </span>
          <span className="font-mono text-diff-added">+{added}</span>
          <span className="-ml-1 font-mono text-diff-removed">−{removed}</span>
        </button>
      ) : null}
    </header>
  );
}

function ThreadTitle() {
  const name = useAbacus((state) => state.thread?.name ?? "");
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const renameThread = useAbacus((state) => state.renameThread);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) void renameThread(next);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        className="w-full max-w-md rounded-md border border-brand/50 bg-input px-2 py-0.5 text-ui-base font-medium outline-none"
        aria-label="Thread name"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="flex max-w-full min-w-0 items-center gap-2 rounded-md px-2 py-0.5 text-left hover:bg-hover"
      title="Rename thread"
    >
      {working ? (
        <span
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand"
          aria-label="Working"
        />
      ) : null}
      <span className="truncate text-ui-base font-medium">{name || "New session"}</span>
    </button>
  );
}

function ContextMeter({
  tokensUsed,
  contextWindow,
}: {
  tokensUsed: number;
  contextWindow: number | null;
}) {
  const share = contextShare(tokensUsed, contextWindow);
  if (tokensUsed === 0) return null;
  const radius = 6;
  const circumference = 2 * Math.PI * radius;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ui-sm text-foreground-subtlest"
          tabIndex={0}
        >
          {share !== null ? (
            <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
              <circle
                cx="8"
                cy="8"
                r={radius}
                fill="none"
                strokeWidth="2"
                className="stroke-border"
              />
              <circle
                cx="8"
                cy="8"
                r={radius}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - share / 100)}
                className={cn("stroke-brand", share >= 85 && "stroke-warning")}
              />
            </svg>
          ) : null}
          <span className="font-mono">
            {share !== null ? `${share}%` : compactNumber(tokensUsed)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {compactNumber(tokensUsed)} tokens
        {contextWindow ? ` of ${compactNumber(contextWindow)} context` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
