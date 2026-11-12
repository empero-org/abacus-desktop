// The timers the agent set to wake itself, pinned at the top of the composer:
// what it will look at, and how long until it does. The agent ends its turn to
// wait rather than sleeping through it, so this is what says another turn will
// start by itself — and the person can call it off.

import { useEffect, useState } from "react";
import { AlarmClockIcon, ChevronRightIcon, XIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { useAbacus } from "../context.js";
import { untilDue } from "../format.js";
import type { PendingTimer } from "../protocol.js";
import { Action } from "./QueueBar.js";

const NONE: PendingTimer[] = [];

/** The time now, a second at a time while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticking]);
  return now;
}

export function TimersBar() {
  const timers = useAbacus((state) => state.thread?.timers ?? NONE);
  const cancelTimer = useAbacus((state) => state.cancelTimer);
  const now = useNow(timers.length > 0);
  const [open, setOpen] = useState(false);
  const [next, ...later] = timers;
  if (!next) return null;

  const cancel = (timer: PendingTimer) => (
    <Action
      hint="Cancel this timer: the agent will not be woken by it"
      onClick={() => void cancelTimer(timer.id)}
    >
      <XIcon className="size-3.5" />
    </Action>
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b px-1.5 py-1.5"
      aria-label="Timers"
    >
      <div className="flex items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-2.5 text-ui-sm">
        <AlarmClockIcon className="mr-1 size-3.5 shrink-0 text-brand" />
        <span className="mr-1 shrink-0 font-medium text-brand">Timer</span>
        <span className="min-w-0 flex-1 truncate" title={next.note}>
          {next.note}
        </span>
        <span className="shrink-0 px-1 text-foreground-subtle tabular-nums">
          {untilDue(next.dueAtMs, now)}
        </span>
        {later.length > 0 ? (
          <CollapsibleTrigger
            aria-label="Later timers"
            className="group/timers flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-foreground-subtle hover:bg-hover hover:text-foreground"
          >
            +{later.length}
            <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]/timers:rotate-90" />
          </CollapsibleTrigger>
        ) : null}
        {cancel(next)}
      </div>
      <CollapsibleContent>
        <ol className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto pb-1">
          {later.map((timer) => (
            <li key={timer.id} className="flex items-center gap-1 py-0.5 pr-0.5 pl-8 text-ui-sm">
              <span className="min-w-0 flex-1 truncate" title={timer.note}>
                {timer.note}
              </span>
              <span className="shrink-0 px-1 text-foreground-subtle tabular-nums">
                {untilDue(timer.dueAtMs, now)}
              </span>
              {cancel(timer)}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
