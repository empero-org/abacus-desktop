// The transcript of the open thread. It sticks to the bottom while the agent
// streams, unless the person scrolled up to read.

import { useEffect, useState } from "react";
import {
  Conversation as StickyConversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.js";
import { Shimmer } from "@/components/ai-elements/shimmer.js";
import { useAbacus } from "../context.js";
import { isWorking } from "../thread.js";
import { BrandMark } from "./BrandMark.js";
import { ItemView } from "./Items.js";

export function Conversation() {
  const items = useAbacus((state) => state.thread?.items ?? []);
  const threadId = useAbacus((state) => state.thread?.threadId);
  const working = useAbacus((state) => isWorking(state.thread));
  const turnId = useAbacus((state) => state.thread?.turnId ?? null);
  const lastTurnStatus = useAbacus((state) => state.thread?.lastTurnStatus ?? null);

  if (items.length === 0 && !turnId) return <EmptyThread />;

  const last = items[items.length - 1];
  // The streaming item shows its own progress; the shimmer covers the gaps
  // between items (waiting on the model, a tool about to start).
  const streamingText =
    working && last && (last.type === "agentMessage" || last.type === "reasoning");
  const runningTool = working && last && "status" in last && last.status === "inProgress";

  return (
    <StickyConversation key={threadId} className="min-h-0 flex-1">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-6 pt-6 pb-10">
        {items.map((item, index) => (
          <ItemView
            key={item.id}
            item={item}
            live={Boolean(turnId) && index === items.length - 1}
          />
        ))}
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
        Describe a change, ask about the code, or paste an error. Abacus asks before running
        anything it should not do on its own.
      </p>
    </div>
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
