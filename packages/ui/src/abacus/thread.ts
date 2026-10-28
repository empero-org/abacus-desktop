// The open thread as the window renders it, and the pure function that folds
// app-server notifications into it.
//
// The stream's contract: `item/started` opens an item, `item/*/delta` grows
// it, and `item/completed` is authoritative, replacing whatever the deltas
// built. A window that misses a delta still ends up showing the right text.

import type {
  AgentMode,
  ChangedFile,
  Item,
  Notifications,
  ReasoningEffort,
  ServerRequest,
  ThreadSnapshot,
  TokenUsage,
} from "./protocol.js";

export interface ThreadView {
  threadId: string;
  name: string;
  /** The profile the session runs. */
  profile: string;
  /** `provider/model`. */
  model: string;
  mode: AgentMode;
  reasoningEffort: ReasoningEffort | null;
  contextWindow: number | null;
  /** How full the context is; null when the CLI does not say. */
  contextTokens: number | null;
  /** Every token the session has spent, which is not the context. */
  tokensUsed: number;
  usage: TokenUsage | null;
  items: Item[];
  /** The running turn, or null when the agent is idle. */
  turnId: string | null;
  lastTurnStatus: string | null;
  changedFiles: ChangedFile[];
  /** Requests the agent is blocked on, oldest first. */
  pending: ServerRequest[];
}

export function threadFromSnapshot(snapshot: ThreadSnapshot): ThreadView {
  return {
    threadId: snapshot.threadId,
    name: snapshot.name,
    profile: snapshot.profile,
    model: snapshot.model,
    mode: snapshot.mode,
    reasoningEffort: snapshot.reasoningEffort,
    contextWindow: snapshot.contextWindow,
    contextTokens: snapshot.contextTokens ?? null,
    tokensUsed: snapshot.tokensUsed,
    usage: snapshot.usage ?? null,
    items: snapshot.items ?? [],
    turnId: null,
    lastTurnStatus: null,
    changedFiles: [],
    pending: [],
  };
}

function upsertItem(items: Item[], item: Item): Item[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

function appendDelta(
  items: Item[],
  itemId: string,
  delta: string,
  type: "agentMessage" | "reasoning",
): Item[] {
  const index = items.findIndex((existing) => existing.id === itemId);
  if (index === -1) return [...items, { id: itemId, type, text: delta }];
  const current = items[index];
  if (!current || !("text" in current)) return items;
  const next = items.slice();
  next[index] = { ...current, text: current.text + delta } as Item;
  return next;
}

/**
 * Fold one notification into the thread. Notifications for another thread are
 * ignored: a stale frame from before a thread switch must not leak into the
 * new one.
 */
export function applyNotification(thread: ThreadView, method: string, params: unknown): ThreadView {
  const threadId = (params as { threadId?: string } | null)?.threadId;
  if (threadId !== undefined && threadId !== thread.threadId) return thread;

  switch (method) {
    case "turn/started": {
      const { turnId } = params as Notifications["turn/started"];
      return { ...thread, turnId, lastTurnStatus: null };
    }
    case "turn/completed": {
      const { status, name } = params as Notifications["turn/completed"];
      // A turn that ends leaves nothing waiting: the agent stopped asking.
      return {
        ...thread,
        turnId: null,
        lastTurnStatus: status,
        name: name ?? thread.name,
        pending: [],
      };
    }
    case "item/started":
    case "item/completed": {
      const { item } = params as Notifications["item/completed"];
      return { ...thread, items: upsertItem(thread.items, item) };
    }
    case "item/agentMessage/delta": {
      const { itemId, delta } = params as Notifications["item/agentMessage/delta"];
      return { ...thread, items: appendDelta(thread.items, itemId, delta, "agentMessage") };
    }
    case "item/reasoning/textDelta": {
      const { itemId, delta } = params as Notifications["item/reasoning/textDelta"];
      return { ...thread, items: appendDelta(thread.items, itemId, delta, "reasoning") };
    }
    case "thread/name/updated":
      return { ...thread, name: (params as Notifications["thread/name/updated"]).name };
    case "thread/mode/updated":
      return { ...thread, mode: (params as Notifications["thread/mode/updated"]).mode };
    case "thread/profile/updated": {
      // Another profile, or the same one changed: the session runs what it says now.
      const update = params as Notifications["thread/profile/updated"];
      return {
        ...thread,
        profile: update.profile,
        model: update.model,
        mode: update.mode,
        reasoningEffort: update.reasoningEffort,
        contextWindow: update.contextWindow ?? thread.contextWindow,
      };
    }
    case "thread/tokenUsage/updated": {
      const update = params as Notifications["thread/tokenUsage/updated"];
      return {
        ...thread,
        tokensUsed: update.tokensUsed,
        contextTokens: update.contextTokens ?? null,
        contextWindow: update.contextWindow,
        usage: update.usage,
      };
    }
    case "turn/diff/updated":
      return { ...thread, changedFiles: (params as Notifications["turn/diff/updated"]).files };
    // A line in the transcript rather than a notice: it happens while the
    // person is away, and a notice would be gone before they are back.
    case "thread/compacted": {
      const { savedTokens } = params as Notifications["thread/compacted"];
      const item: Item = {
        id: `compaction_${thread.items.length}`,
        type: "contextCompaction",
        savedTokens,
      };
      return { ...thread, items: [...thread.items, item] };
    }
    default:
      return thread;
  }
}

/** What one of the terminal's commands said, at the end of the transcript. */
export function withCommandOutput(thread: ThreadView, command: string, text: string): ThreadView {
  const item: Item = { id: `command_${thread.items.length}`, type: "commandOutput", command, text };
  return { ...thread, items: [...thread.items, item] };
}

export function addPending(thread: ThreadView, request: ServerRequest): ThreadView {
  if (request.params.threadId !== thread.threadId) return thread;
  if (thread.pending.some((existing) => existing.id === request.id)) return thread;
  return { ...thread, pending: [...thread.pending, request] };
}

export function resolvePending(thread: ThreadView, id: string | number): ThreadView {
  return { ...thread, pending: thread.pending.filter((request) => request.id !== id) };
}

/** Whether the agent is working: a turn is running and nothing is waiting on the person. */
export function isWorking(thread: ThreadView | null): boolean {
  return Boolean(thread?.turnId) && thread?.pending.length === 0;
}
