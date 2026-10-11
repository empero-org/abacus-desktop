// One background worker's transcript in the expanded tasks panel: what it was
// asked, then everything it said and did, refreshed while it runs.

import { useEffect, useState } from "react";
import { SquareIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.js";
import { useAbacus } from "../context.js";
import { elapsed, tokenCount } from "../format.js";
import type { BackgroundTask, Item } from "../protocol.js";
import { toolActivity } from "../tools.js";
import { ItemView } from "./Items.js";

const REFRESH_MS = 1000;

export function TaskTranscript({ task, now }: { task: BackgroundTask; now: number }) {
  const readTask = useAbacus((state) => state.readTask);
  const stopTask = useAbacus((state) => state.stopTask);
  const [items, setItems] = useState<Item[] | null>(null);
  const running = task.state === "running";

  // Read now, and keep reading while it runs; once it ends, one last read.
  useEffect(() => {
    let live = true;
    const load = () =>
      void readTask(task.id).then((result) => {
        if (live) setItems(result?.items ?? []);
      });
    load();
    if (!running) return () => void (live = false);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [readTask, task.id, running]);

  // The task itself is the first item; the header shows it instead.
  const [first, ...rest] = items ?? [];
  const steps = first?.type === "userMessage" ? rest : (items ?? []);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-ui-lg font-medium break-words">{task.name}</h3>
            <div className="flex flex-wrap items-center gap-x-2.5 text-ui-sm text-foreground-subtle">
              <span className="capitalize">{task.role}</span>
              {task.model ? <span>{task.model}</span> : null}
              <span className="font-mono">
                {elapsed(
                  (task.finishedAt ? Date.parse(task.finishedAt) : now) -
                    Date.parse(task.startedAt),
                )}
              </span>
              <span>{tokenCount(task.tokens)} tokens</span>
              <span>
                {task.toolUses} tool {task.toolUses === 1 ? "use" : "uses"}
              </span>
              <span
                className={cn(
                  running ? "text-brand" : "",
                  task.state === "done" && "text-success",
                  task.state === "failed" && "text-destructive",
                )}
              >
                {running ? toolActivity(task.tool) : task.state}
              </span>
            </div>
          </div>
          {running ? (
            <button
              type="button"
              onClick={() => void stopTask(task.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-ui-sm text-foreground-subtle hover:border-destructive/50 hover:text-destructive"
            >
              <SquareIcon className="size-2.5 fill-current" />
              Stop
            </button>
          ) : null}
        </div>
        {task.prompt ? (
          <p className="line-clamp-3 text-ui-sm whitespace-pre-wrap text-foreground-subtle">
            {task.prompt}
          </p>
        ) : null}
      </header>
      {items === null ? (
        <div className="flex flex-1 items-center justify-center text-ui-sm text-foreground-subtlest">
          Loading…
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-ui-sm text-foreground-subtlest">
          {running ? "Starting…" : "Nothing was recorded for this task."}
        </div>
      ) : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="gap-5 px-6 pt-5 pb-8">
            {steps.map((item, index) => (
              <ItemView key={item.id} item={item} live={running && index === steps.length - 1} />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}
    </section>
  );
}
