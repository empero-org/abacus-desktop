// Sending what the person writes: a new turn when abacus is idle, and while it
// works, a queue above the composer. The oldest queued message goes when the
// turn ends; Steer hands one to the running turn, and it stays in the stack
// until the model reads it after its current step (or, if the turn ends
// first, it starts the next one); Send now stops the turn and sends one.

import { inputPart, type Attachment } from "./attachments.js";
import type { AbacusBridge } from "./bridge.js";
import { parseCommand } from "./completion.js";
import type { Notifications } from "./protocol.js";
import {
  draftWith,
  nextQueued,
  sendsQueued,
  withoutDelivered,
  type QueuedMessage,
} from "./queue.js";
import type { AbacusState } from "./state.js";
import { runWindowCommand } from "./windowCommands.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;
type MessageActions = Pick<
  AbacusState,
  "send" | "setDraft" | "steerQueued" | "sendQueuedNow" | "removeQueued" | "editQueued"
>;

let queueCounter = 0;

/** How often, at most, the app server hears that the person is still typing. */
const TYPING_EVERY_MS = 15_000;

function input(text: string, attachments: Attachment[]) {
  return [...(text.trim() ? [{ type: "text", text }] : []), ...attachments.map(inputPart)];
}

export function messageActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  guard: (work: () => Promise<void>) => Promise<void>,
) {
  const queueOf = (threadId: string) => get().queued[threadId] ?? [];
  let typedAt = 0;
  const setQueue = (threadId: string, queue: QueuedMessage[]) =>
    set({ queued: { ...get().queued, [threadId]: queue } });
  const find = (id: number) => {
    const threadId = get().thread?.threadId;
    const message = threadId ? queueOf(threadId).find((entry) => entry.id === id) : undefined;
    return threadId && message ? { threadId, message } : null;
  };

  // Take a message off the open thread's queue, to send, drop or edit.
  const take = (id: number) => {
    const found = find(id);
    if (!found) return null;
    const { threadId } = found;
    setQueue(
      threadId,
      queueOf(threadId).filter((entry) => entry.id !== id),
    );
    if (get().sendingNow[threadId] === id) {
      const { [threadId]: _held, ...sendingNow } = get().sendingNow;
      set({ sendingNow });
    }
    return found;
  };

  // A queued message as a turn of its own; back at the front if it fails.
  const sendAsTurn = async (threadId: string, message: QueuedMessage) => {
    try {
      await bridge.request("turn/start", {
        threadId,
        input: input(message.text, message.attachments),
      });
    } catch (error) {
      setQueue(threadId, [message, ...queueOf(threadId)]);
      throw error;
    }
  };

  const actions: MessageActions = {
    setDraft(threadId, text) {
      set({ drafts: { ...get().drafts, [threadId]: text } });
      // The app server cannot see the composer. Told the person is writing,
      // it holds idle compaction off as a keystroke in the terminal does; an
      // abacus without `thread/typing` answers with an error, ignored here.
      const now = Date.now();
      if (now - typedAt >= TYPING_EVERY_MS) {
        typedAt = now;
        bridge.request("thread/typing").catch(() => {});
      }
    },

    send: (text) =>
      guard(async () => {
        const thread = get().thread;
        const attached = thread ? (get().attachments[thread.threadId] ?? []) : [];
        if (!thread || (!text.trim() && attached.length === 0)) return;
        const clear = (draft: string, files: Attachment[]) =>
          set({
            drafts: { ...get().drafts, [thread.threadId]: draft },
            attachments: { ...get().attachments, [thread.threadId]: files },
          });
        const command = parseCommand(text);
        // `/steer`: what follows goes to the running turn at once, as Steer
        // on a queued message sends it; with nothing running it is a message.
        if (command?.name === "steer") {
          if (!command.argument && attached.length === 0) {
            get().notify("Say what to tell the running turn: /steer <message>.", "warning");
            return;
          }
          clear("", []);
          const steer = { id: ++queueCounter, text: command.argument, attachments: attached };
          if (!thread.turnId) return sendAsTurn(thread.threadId, steer);
          setQueue(thread.threadId, [...queueOf(thread.threadId), steer]);
          return actions.steerQueued(steer.id);
        }
        // The window's own commands act here and start no turn.
        if (
          command &&
          attached.length === 0 &&
          (await runWindowCommand(get(), command.name, command.argument))
        ) {
          clear("", []);
          return;
        }
        clear("", []);
        // While abacus works a message waits its turn above the composer;
        // `/btw` is the exception, a note meant for the running turn.
        if (thread.turnId && !(command?.name === "btw" && attached.length === 0)) {
          const queued = { id: ++queueCounter, text, attachments: attached };
          setQueue(thread.threadId, [...queueOf(thread.threadId), queued]);
          return;
        }
        try {
          // Skills, plugin commands and `/btw` are resolved by the app server.
          await bridge.request("turn/start", {
            threadId: thread.threadId,
            input: input(text, attached),
          });
        } catch (error) {
          // Nothing was sent: give the person back what they wrote.
          if (
            !get().drafts[thread.threadId] &&
            !(get().attachments[thread.threadId] ?? []).length
          ) {
            clear(text, attached);
          }
          throw error;
        }
      }),

    steerQueued: (id) =>
      guard(async () => {
        const found = find(id);
        if (!found || found.message.steering !== undefined) return;
        const { threadId, message } = found;
        try {
          const { text } = await bridge.request<{ text?: string }>("turn/steer", {
            threadId,
            input: input(message.text, message.attachments),
          });
          // It stays in the stack until the model reads it.
          setQueue(
            threadId,
            queueOf(threadId).map((entry) =>
              entry.id === id ? { ...entry, steering: text ?? message.text } : entry,
            ),
          );
        } catch (error) {
          // With the turn over there is nothing to steer: it is the next turn.
          if (get().thread?.turnId) throw error;
          if (take(id)) await sendAsTurn(threadId, message);
        }
      }),

    sendQueuedNow: (id) =>
      guard(async () => {
        const found = find(id);
        if (!found) return;
        const { threadId, message } = found;
        if (!get().thread?.turnId) {
          // A steering message is the app server's to send.
          if (message.steering === undefined && take(id)) await sendAsTurn(threadId, message);
          return;
        }
        // Stop the turn. A steering message then starts the next one on the
        // app server; any other goes from here once the turn has ended.
        if (message.steering === undefined) {
          set({ sendingNow: { ...get().sendingNow, [threadId]: id } });
        }
        await bridge.request("turn/interrupt");
      }),

    removeQueued(id) {
      const steering = take(id)?.message.steering;
      // A steered message is taken back from the app server too, unless the
      // model has read it already.
      if (steering !== undefined) {
        void guard(
          async () => void (await bridge.request("turn/steer/withdraw", { text: steering })),
        );
      }
    },

    editQueued: (id) =>
      guard(async () => {
        const taken = take(id);
        if (!taken) return;
        const { threadId, message } = taken;
        if (message.steering !== undefined) {
          const { withdrawn } = await bridge.request<{ withdrawn: boolean }>(
            "turn/steer/withdraw",
            { text: message.steering },
          );
          // Read already: it is in the transcript, not back in the draft.
          if (!withdrawn) return get().notify("abacus had read it already.");
        }
        set({
          drafts: {
            ...get().drafts,
            [threadId]: draftWith(get().drafts[threadId] ?? "", message.text),
          },
          attachments: {
            ...get().attachments,
            [threadId]: [...(get().attachments[threadId] ?? []), ...message.attachments],
          },
        });
      }),
  };

  /**
   * After a turn ends: the message Send now held back, or else the oldest
   * queued one when the turn finished on its own. One at a time; the next
   * waits for the turn this one starts.
   */
  async function flushQueued({ threadId, status, continues }: Notifications["turn/completed"]) {
    if (get().thread?.threadId !== threadId || continues) return;
    const held = get().sendingNow[threadId];
    const next =
      held !== undefined
        ? queueOf(threadId).find((entry) => entry.id === held)
        : sendsQueued(status, continues)
          ? nextQueued(queueOf(threadId))
          : undefined;
    if (held !== undefined && !next) {
      const { [threadId]: _gone, ...sendingNow } = get().sendingNow;
      set({ sendingNow });
    }
    if (!next || !take(next.id)) return;
    await guard(() => sendAsTurn(threadId, next));
  }

  /** The model read a steering message: the transcript has it now, so the stack lets it go. */
  function delivered({ threadId, text }: Notifications["turn/steer/delivered"]) {
    setQueue(threadId, withoutDelivered(queueOf(threadId), text));
  }

  return { actions, flushQueued, delivered };
}
