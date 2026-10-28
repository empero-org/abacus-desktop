// The transcript of the open thread. It sticks to the bottom while the agent
// streams, unless the person scrolled up to read. What the agent did between
// two messages folds into one group; the goal and plan bars show their own
// bookkeeping calls, so those stay out of it.

import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import {
  Conversation as StickyConversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.js";
import { Shimmer } from "@/components/ai-elements/shimmer.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { useAbacus } from "../context.js";
import type { Item } from "../protocol.js";
import { groupSteps, stepSummary } from "../steps.js";
import { isWorking } from "../thread.js";
import { shownInBar } from "../tools.js";
import { BrandMark } from "./BrandMark.js";
import { ItemView } from "./Items.js";

const NONE: Item[] = [];

export function Conversation() {
  const items = useAbacus((state) => state.thread?.items ?? NONE);
  const threadId = useAbacus((state) => state.thread?.threadId);
  const working = useAbacus((state) => isWorking(state.thread));
  const turnId = useAbacus((state) => state.thread?.turnId ?? null);
  const lastTurnStatus = useAbacus((state) => state.thread?.lastTurnStatus ?? null);
  const capabilities = useAbacus((state) => state.capabilities);
  const shown = useMemo(
    () => items.filter((item) => !("status" in item && shownInBar(item.name, capabilities))),
    [items, capabilities],
  );
  const entries = useMemo(() => groupSteps(shown), [shown]);

  if (shown.length === 0 && !turnId) return <EmptyThread />;

  const last = shown[shown.length - 1];
  // The item the running turn is writing.
  const liveId = turnId ? items[items.length - 1]?.id : undefined;
  // The streaming item shows its own progress; the shimmer covers the gaps
  // between items (waiting on the model, a tool about to start).
  const streamingText =
    working && last && (last.type === "agentMessage" || last.type === "reasoning");
  const runningTool = working && last && "status" in last && last.status === "inProgress";

  return (
    <StickyConversation key={threadId} className="min-h-0 flex-1">
      <ConversationContent className="mx-auto w-full max-w-(--content-width) gap-5 px-6 pt-6 pb-10">
        {entries.map((entry, index) =>
          entry.kind === "item" ? (
            <ItemView key={entry.item.id} item={entry.item} live={entry.item.id === liveId} />
          ) : (
            <StepGroup
              key={entry.id}
              items={entry.items}
              liveId={liveId}
              live={Boolean(turnId) && index === entries.length - 1}
            />
          ),
        )}
        {working && !streamingText && !runningTool ? (
          <WorkingLine key={turnId} turnId={turnId} />
        ) : null}
        {!turnId && lastTurnStatus && lastTurnStatus !== "completed" ? (
          <TurnEnd status={lastTurnStatus} />
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </StickyConversation>
  );
}

function EmptyThread() {
  const workspace = useAbacus((state) => state.workspace);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-[8vh] text-center">
      <BrandMark className="size-8 text-foreground" />
      <h1 className="text-[26px] leading-tight font-medium tracking-[-0.02em] text-balance">
        What should we build
        {workspace ? (
          <>
            {" "}
            in <span className="text-brand">{workspace.name}</span>
          </>
        ) : null}
        ?
      </h1>
      <p className="max-w-md text-ui-base text-foreground-subtle">
        Describe a change, ask about the code, or paste an error. In Auto, anything beyond edits in
        this project is reviewed before it runs.
      </p>
    </div>
  );
}

/**
 * The steps the agent took between two messages, under one line. Open while
 * the agent is still in them or one waits on the person, folded once it has
 * spoken; once the person opens or closes it, it stays as they left it.
 */
function StepGroup({
  items,
  live,
  liveId,
}: {
  items: Item[];
  live: boolean;
  liveId: string | undefined;
}) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const waiting = items.some((item) => "status" in item && item.status === "awaitingApproval");
  const { label, detail } = stepSummary(items);

  return (
    <Collapsible open={chosen ?? (live || waiting)} onOpenChange={setChosen}>
      <CollapsibleTrigger className="group/steps flex max-w-full min-w-0 items-center gap-2 text-left text-ui-base text-foreground-subtle hover:text-foreground">
        <span className="shrink-0">{label}</span>
        {detail ? (
          <span className="min-w-0 truncate text-ui-sm text-foreground-subtlest">{detail}</span>
        ) : null}
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]/steps:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-4 flex flex-col gap-5 border-l-2 border-border pl-4">
          {items.map((item) => (
            <ItemView key={item.id} item={item} live={item.id === liveId} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** When each turn started, so the timer survives the line unmounting between items. */
const turnStarts = new Map<string, number>();

function WorkingLine({ turnId }: { turnId: string | null }) {
  const [startedAt] = useState(() => {
    if (!turnId) return Date.now();
    if (!turnStarts.has(turnId)) turnStarts.set(turnId, Date.now());
    return turnStarts.get(turnId)!;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div className="flex items-center gap-2 text-ui-base">
      <Shimmer as="span" duration={1.6}>
        Working
      </Shimmer>
      {seconds >= 2 ? (
        <span className="font-mono text-ui-sm text-foreground-subtlest">{seconds}s</span>
      ) : null}
    </div>
  );
}

const TURN_END: Record<string, string> = {
  interrupted: "Stopped",
  failed: "The turn failed",
  stepLimit: "Stopped at the step limit. Send a message to continue",
};

function TurnEnd({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3 text-ui-sm text-foreground-subtlest">
      <span className="h-px flex-1 bg-border" />
      <span>{TURN_END[status] ?? `Turn ended: ${status}`}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
