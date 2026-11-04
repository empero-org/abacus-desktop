// A thread's app server stops by itself once nothing has happened for five
// minutes (`ABACUS_IDLE_EXIT_SECS`, set by the main process), and gives the
// machine its memory back. The window keeps showing the thread, asleep; the
// next request it makes, or the person coming back to the window, starts the
// server again and reopens the thread, which reads it back as it was saved.

import type { AbacusBridge } from "./bridge.js";
import type { InitializeResult, ThreadSnapshot } from "./protocol.js";
import type { AbacusState } from "./state.js";
import { threadFromSnapshot } from "./thread.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

/** What the window keeps per thread, moved from one id to another. */
export function carriedOver(
  state: AbacusState,
  from: string,
  to: string,
): Partial<Pick<AbacusState, "drafts" | "attachments" | "queued" | "sendingNow">> {
  if (from === to) return {};
  const move = <T>(record: Record<string, T>) => {
    if (!(from in record)) return record;
    const { [from]: kept, ...rest } = record;
    return { ...rest, [to]: kept as T };
  };
  return {
    drafts: move(state.drafts),
    attachments: move(state.attachments),
    queued: move(state.queued),
    sendingNow: move(state.sendingNow),
  };
}

export function sleeping(bridge: AbacusBridge, get: Get, set: Set) {
  let waking: Promise<void> | null = null;

  const start = async () => {
    const { workspace, thread, appInfo } = get();
    if (!workspace || !thread) return;
    const opened = await bridge.openWorkspace(workspace.workspace, false);
    // Before its first frame, so the window knows the frames are its own.
    set({ server: opened.server ?? null });
    const init = await bridge.request<InitializeResult>("initialize", {
      clientInfo: { name: "abacus-desktop", version: appInfo?.version ?? "0.0.0" },
    });
    // A thread nothing was sent in yet was never saved, so there is nothing to
    // read back: the new thread the server opened on stands in for it.
    const snapshot =
      thread.items.length === 0
        ? init.thread
        : await bridge.request<ThreadSnapshot>("thread/resume", { threadId: thread.threadId });
    const woken = threadFromSnapshot(snapshot);
    set({ thread: woken, asleep: false, ...carriedOver(get(), thread.threadId, woken.threadId) });
  };

  /**
   * Start the shown thread's server again, if it went to sleep. Requests made
   * meanwhile wait on the same start; the promise is let go of only once it
   * has settled, so a call while awake never leaves a finished one behind.
   */
  const wake = (): Promise<void> => {
    if (!get().asleep) return Promise.resolve();
    waking ??= start().finally(() => {
      waking = null;
    });
    return waking;
  };

  /** The bridge the window's actions use: a request to a sleeping thread wakes it first. */
  const live: AbacusBridge = {
    ...bridge,
    async request<T = unknown>(method: string, params?: unknown, server?: number): Promise<T> {
      if (server === undefined && get().asleep) await wake();
      return bridge.request<T>(method, params, server);
    },
  };

  return { live, wake };
}
