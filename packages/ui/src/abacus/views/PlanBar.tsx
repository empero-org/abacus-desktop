// The agent's task list for the work at hand, pinned at the top of the
// composer: how far along it is and what comes next, opened for every step.
// It shows while a step is left, and through the turn that finishes the last.

import { useState } from "react";
import { ChevronRightIcon, CircleCheckIcon, CircleIcon, ListChecksIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { useAbacus } from "../context.js";
import type { TaskEntry } from "../protocol.js";

const NONE: TaskEntry[] = [];

export function PlanBar() {
  const tasks = useAbacus((state) => state.thread?.taskList ?? NONE);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const [open, setOpen] = useState(false);
  const next = tasks.find((task) => !task.done);
  if (tasks.length === 0 || (!next && !running)) return null;

  const done = tasks.filter((task) => task.done).length;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b px-1.5 py-1.5">
      <CollapsibleTrigger
        aria-label="Plan"
        className="group/plan flex w-full min-w-0 items-center gap-1 rounded-lg py-1 pr-1.5 pl-2.5 text-left text-ui-sm hover:bg-hover/50"
      >
        <ListChecksIcon className="mr-1 size-3.5 shrink-0 text-brand" />
        <span className="mr-1 shrink-0 font-medium text-brand">Plan</span>
        <span className="shrink-0 text-foreground-subtle tabular-nums">
          {done}/{tasks.length}
        </span>
        <span className="mx-1.5 h-1 w-14 shrink-0 overflow-hidden rounded-full bg-hover">
          <span
            className="block h-full rounded-full bg-success transition-[width]"
            style={{ width: `${(done * 100) / tasks.length}%` }}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{next ? next.text : "All done"}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-data-[state=open]/plan:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto pr-1.5 pb-1 pl-2.5">
          {tasks.map((task, index) => (
            <li key={index} className="flex items-start gap-2 text-ui-sm">
              {task.done ? (
                <CircleCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-foreground-subtlest" />
              )}
              <span
                className={cn(
                  task.done && "text-foreground-subtle",
                  task === next && "font-medium text-foreground",
                )}
              >
                {task.text}
              </span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
