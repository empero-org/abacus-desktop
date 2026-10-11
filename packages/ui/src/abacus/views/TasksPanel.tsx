// Background tasks: the subagents the agent started, running and finished.
// Compact, it floats under the top bar; expanded, it takes the right side of
// the window with the selected worker's transcript beside the list.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import { elapsed, tokenCount } from "../format.js";
import type { BackgroundTask } from "../protocol.js";
import { toolActivity } from "../tools.js";
import { TaskTranscript } from "./TaskTranscript.js";

export function TasksPanel({
  expanded,
  onExpandedChange,
  onClose,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
}) {
  const tasks = useAbacus((state) => state.tasks);
  const clearTasks = useAbacus((state) => state.clearTasks);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const now = useNow(tasks.some((task) => task.state === "running"));

  const running = tasks.filter((task) => task.state === "running");
  const finished = tasks.filter((task) => task.state !== "running");
  const current = tasks.find((task) => task.id === selected) ?? running[0] ?? finished[0] ?? null;

  const open = (task: BackgroundTask) => {
    setSelected(task.id);
    onExpandedChange(true);
  };

  const list = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
      {tasks.length === 0 ? (
        <p className="px-1 py-6 text-center text-ui-sm text-foreground-subtlest">
          Subagents the agent starts show up here while they work.
        </p>
      ) : null}
      {running.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-ui-sm text-foreground-subtle">Running</h3>
          {running.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              now={now}
              selected={expanded && current?.id === task.id}
              onOpen={() => open(task)}
            />
          ))}
        </section>
      ) : null}
      {finished.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowFinished((value) => !value)}
            className="flex items-center gap-1 px-1 text-left text-ui-sm text-foreground-subtle hover:text-foreground"
            aria-expanded={showFinished || running.length === 0}
          >
            Finished {finished.length}
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform",
                (showFinished || running.length === 0) && "rotate-90",
              )}
            />
          </button>
          {showFinished || running.length === 0
            ? finished.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  now={now}
                  selected={expanded && current?.id === task.id}
                  onOpen={() => open(task)}
                />
              ))
            : null}
        </section>
      ) : null}
    </div>
  );

  return (
    <aside
      className={cn(
        "absolute right-3 z-30 flex flex-col overflow-hidden rounded-2xl border border-popover-border bg-popover shadow-[0_16px_50px_-16px_rgb(0_0_0/0.6)]",
        expanded
          ? "top-[calc(var(--app-chrome-height)+8px)] bottom-3 left-3 sm:left-auto sm:w-[min(1040px,calc(100%-24px))]"
          : "top-[calc(var(--app-chrome-height)+8px)] max-h-[min(640px,calc(100%-var(--app-chrome-height)-24px))] w-[344px]",
      )}
      aria-label="Background tasks"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
        <h2 className="flex-1 text-ui-lg font-medium">Background tasks</h2>
        <PanelButton
          label="Clear finished"
          onClick={() => void clearTasks()}
          disabled={finished.length === 0}
        >
          <Trash2Icon className="size-4" />
        </PanelButton>
        <PanelButton
          label={expanded ? "Collapse" : "Expand"}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
        </PanelButton>
        <PanelButton label="Close" onClick={onClose}>
          <XIcon className="size-4" />
        </PanelButton>
      </header>
      {expanded ? (
        <div className="flex min-h-0 flex-1 border-t">
          <div className="flex w-[320px] shrink-0 flex-col border-r pt-3">{list}</div>
          {current ? (
            <TaskTranscript key={current.id} task={current} now={now} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-ui-sm text-foreground-subtlest">
              No task selected
            </div>
          )}
        </div>
      ) : (
        list
      )}
    </aside>
  );
}

function TaskCard({
  task,
  now,
  selected,
  onOpen,
}: {
  task: BackgroundTask;
  now: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const stopTask = useAbacus((state) => state.stopTask);
  const running = task.state === "running";

  return (
    <article
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card px-3.5 py-3",
        selected && "border-brand/50 bg-selected",
      )}
    >
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 text-ui-base leading-snug font-medium break-words">
          {task.name}
        </h4>
        {running ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void stopTask(task.id)}
                className="-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-foreground-subtle hover:border-destructive/50 hover:text-destructive"
                aria-label={`Stop ${task.name}`}
              >
                <SquareIcon className="size-2.5 fill-current" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Stop</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
        <span className="capitalize">{task.role}</span>
        <span className="font-mono text-foreground-subtlest">
          {elapsed(
            (task.finishedAt ? Date.parse(task.finishedAt) : now) - Date.parse(task.startedAt),
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-ui-sm text-foreground-subtle">
        {task.model ? <span className="truncate">{task.model}</span> : null}
        <span>{tokenCount(task.tokens)} tokens</span>
        <span>
          {task.toolUses} tool {task.toolUses === 1 ? "use" : "uses"}
        </span>
      </div>
      <div className="flex items-center gap-2 text-ui-sm">
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            running ? "text-foreground-subtle" : STATE_COLOR[task.state],
          )}
          title={task.activity}
        >
          {running ? toolActivity(task.tool) : STATE_LABEL[task.state]}
        </span>
        <button type="button" onClick={onOpen} className="shrink-0 text-brand hover:underline">
          View transcript
        </button>
      </div>
    </article>
  );
}

const STATE_LABEL: Record<BackgroundTask["state"], string> = {
  running: "Running",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const STATE_COLOR: Record<BackgroundTask["state"], string> = {
  running: "text-foreground-subtle",
  done: "text-success",
  failed: "text-destructive",
  stopped: "text-foreground-subtlest",
};

function PanelButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The current time, ticking each second while something runs. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

const EXPANDED_KEY = "abacus.tasks.expanded";

/**
 * Whether the tasks panel is open and expanded. It opens by itself when
 * workers start after none were running; expanded or not is remembered.
 */
export function useTasksPanel() {
  const running = useAbacus(
    (state) => state.tasks.filter((task) => task.state === "running").length,
  );
  const [open, setOpen] = useState(false);
  const [expanded, setExpandedState] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const before = useRef(running);

  useEffect(() => {
    if (before.current === 0 && running > 0) setOpen(true);
    before.current = running;
  }, [running]);

  const setExpanded = (value: boolean) => {
    setExpandedState(value);
    try {
      localStorage.setItem(EXPANDED_KEY, value ? "1" : "0");
    } catch {
      // Storage off: the choice holds for this window.
    }
  };

  return { open, setOpen, expanded, setExpanded, running };
}
