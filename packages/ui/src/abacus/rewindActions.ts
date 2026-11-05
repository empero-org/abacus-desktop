// Going back to one of the person's messages: in this thread (rewind), or in a
// new one that leaves this one as it was (fork). Either way the message comes
// back to the composer, to edit and send again. Files the agent changed stay
// as they are; a turn's edits card undoes those.

import { draftAttachments } from "./attachments.js";
import type { AbacusBridge } from "./bridge.js";
import type { Item, MessageDraft, ThreadSnapshot } from "./protocol.js";
import { draftWith } from "./queue.js";
import type { AbacusState } from "./state.js";
import { threadFromSnapshot } from "./thread.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;
type UserMessage = Extract<Item, { type: "userMessage" }>;

/** Whether the person wrote it, rather than another session, an agent or a goal. */
export function isPersonMessage(item: Item): item is UserMessage {
  return item.type === "userMessage" && !item.from && !item.goal && !item.report;
}

/**
 * The person's messages the conversation can go back to, each with how far
 * back it is (1 for the latest), as `thread/rewind` counts. Those before the
 * last compaction are only in its summary now, so they are not offered.
 */
export function rewindPoints(items: Item[]): Map<string, number> {
  const points = new Map<string, number>();
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    if (item.type === "contextCompaction") break;
    if (isPersonMessage(item)) points.set(item.id, points.size + 1);
  }
  return points;
}

export function rewindActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  errorMessage: (error: unknown) => string,
): Pick<AbacusState, "rewindTo" | "forkFrom"> {
  // The message in `threadId`'s composer, after whatever is there already.
  const putBack = (threadId: string, text: string, draft: MessageDraft | undefined) => {
    const typed = get().drafts[threadId] ?? "";
    set({
      drafts: { ...get().drafts, [threadId]: text ? draftWith(typed, text) : typed },
      attachments: {
        ...get().attachments,
        [threadId]: [
          ...(get().attachments[threadId] ?? []),
          ...(draft ? draftAttachments(draft) : []),
        ],
      },
    });
  };
  const failed = (what: string, error: unknown) => {
    get().notify(`Could not ${what}: ${errorMessage(error)}`, "error");
    return false;
  };

  return {
    async rewindTo(item, back) {
      try {
        const snapshot = await bridge.request<ThreadSnapshot>("thread/rewind", {
          back,
          text: item.text,
        });
        const thread = get().thread;
        if (!thread || thread.threadId !== snapshot.threadId) return true;
        // What came before it stays as the window has it, times included.
        const at = thread.items.findIndex((entry) => entry.id === item.id);
        set({
          thread: {
            ...thread,
            items: at === -1 ? snapshot.items : thread.items.slice(0, at),
            contextTokens: snapshot.contextTokens ?? thread.contextTokens,
            lastTurnStatus: null,
          },
        });
        putBack(thread.threadId, item.text, snapshot.draft);
        return true;
      } catch (error) {
        return failed("rewind", error);
      }
    },

    async forkFrom(item, back) {
      try {
        const snapshot = await bridge.request<ThreadSnapshot>("thread/fork", {
          back,
          text: item.text,
        });
        set({ thread: threadFromSnapshot(snapshot), view: "chat" });
        putBack(snapshot.threadId, item.text, snapshot.draft);
        // The fork is in this project, whose sessions the thread list holds.
        await get().refreshThreads();
        return true;
      } catch (error) {
        return failed("fork", error);
      }
    },
  };
}
