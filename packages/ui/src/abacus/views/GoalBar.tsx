// The thread's persistent goal, pinned at the top of the composer above the
// queue: what abacus works toward across turns, and whether it still does.
// `/goal` sets it and the model marks it complete once it has checked; the
// buttons here pause, resume, edit, finish or clear it as `/goal` would.

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  EllipsisIcon,
  GoalIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import type { Goal, GoalStatus } from "../protocol.js";
import { Action } from "./QueueBar.js";

/** How each status reads: its colour, and a word when it is not simply under way. */
const LOOK: Record<GoalStatus, { tone: string; label?: string }> = {
  active: { tone: "text-brand" },
  paused: { tone: "text-warning", label: "Paused" },
  complete: { tone: "text-success", label: "Done" },
  cancelled: { tone: "text-foreground-subtlest", label: "Cancelled" },
};

export function GoalBar() {
  const goal = useAbacus((state) => state.thread?.goal ?? null);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const runCommand = useAbacus((state) => state.runCommand);
  const [editing, setEditing] = useState(false);
  // Edit opens a field, and only once the menu has closed: until then the menu
  // holds focus, and would take it back to its button after.
  const editChosen = useRef(false);
  if (!goal) return null;

  // The bar shows what changed, so the transcript need not say it as well.
  const goalCommand = (argument: string) => void runCommand("goal", argument, true);
  const look = LOOK[goal.status];
  const open = goal.status === "active" || goal.status === "paused";

  return (
    <div className="border-b px-1.5 py-1.5" aria-label="Goal">
      <div className="flex items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-2.5 text-ui-sm">
        <GoalIcon className={cn("mr-1 size-3.5 shrink-0", look.tone)} />
        <span className={cn("mr-1 shrink-0 font-medium", look.tone)}>Goal</span>
        {editing ? (
          <ObjectiveField
            objective={goal.objective}
            onDone={(objective) => {
              setEditing(false);
              if (objective && objective !== goal.objective) goalCommand(`edit ${objective}`);
            }}
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 flex-1 truncate">{goal.objective}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md flex-col items-start">
              <GoalDetails goal={goal} />
            </TooltipContent>
          </Tooltip>
        )}
        {look.label ? <span className={cn("px-2 py-1", look.tone)}>{look.label}</span> : null}
        {goal.status === "active" ? (
          <Action
            hint={
              running
                ? "Stop the current turn and hold the goal until you resume it"
                : "Hold the goal until you resume it"
            }
            onClick={() => goalCommand("pause")}
          >
            <PauseIcon className="size-3.5" />
            Pause
          </Action>
        ) : goal.status === "paused" ? (
          <Action
            hint="Pick the goal back up; abacus starts on it"
            onClick={() => goalCommand("resume")}
          >
            <PlayIcon className="size-3.5" />
            Resume
          </Action>
        ) : (
          <Action hint="Take the goal off this session" onClick={() => goalCommand("clear")}>
            Clear
          </Action>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Goal options"
              className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            onCloseAutoFocus={(event) => {
              if (!editChosen.current) return;
              editChosen.current = false;
              event.preventDefault();
              setEditing(true);
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                editChosen.current = true;
              }}
              className="gap-2.5"
            >
              <PencilLineIcon className="size-3.5" />
              Edit
            </DropdownMenuItem>
            {open ? (
              <DropdownMenuItem onSelect={() => goalCommand("done")} className="gap-2.5">
                <CheckIcon className="size-3.5" />
                Mark done
              </DropdownMenuItem>
            ) : null}
            {open ? (
              <DropdownMenuItem onSelect={() => goalCommand("clear")} className="gap-2.5">
                <Trash2Icon className="size-3.5" />
                Clear
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** The whole objective, how far it has come, and the model's latest word on it. */
function GoalDetails({ goal }: { goal: Goal }) {
  const turns = goal.iterations === 1 ? "1 turn" : `${goal.iterations} turns`;
  return (
    <>
      <span className="whitespace-pre-wrap">{goal.objective}</span>
      <span className="text-tooltip-foreground/70">{turns} so far</span>
      {goal.note ? (
        <span className="whitespace-pre-wrap text-tooltip-foreground/70">Latest: {goal.note}</span>
      ) : null}
    </>
  );
}

/**
 * The objective as a field: Enter or leaving keeps it, Escape goes back. It
 * sits inside the composer's form, so Enter must not send the draft as well.
 */
function ObjectiveField({
  objective,
  onDone,
}: {
  objective: string;
  onDone: (objective: string | null) => void;
}) {
  const [text, setText] = useState(objective);
  const input = useRef<HTMLInputElement>(null);
  // Escape closes the field, and the blur that follows must not keep the text.
  const settled = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    onDone(save ? text.trim() : null);
  };
  return (
    <input
      ref={input}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      aria-label="Goal"
      className="min-w-0 flex-1 rounded-md bg-hover px-1.5 py-0.5 outline-none"
    />
  );
}
