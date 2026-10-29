// Several threads at once. The window shows one thread; a thread it leaves
// while that thread still works (a turn running, a question for the person,
// messages waiting) keeps its app server, parked. The parked thread's frames
// keep folding into its view here, so switching back shows it as it is, and
// the sidebar can say which threads work, which need the person, and which
// finished while nobody looked. A parked thread whose turn ends with nothing
// left to do lets its server go.

import type { AbacusBridge, ServerMessage } from "./bridge.js";
import { classifyRequest, type Notifications, type ThreadSnapshot } from "./protocol.js";
import type { AbacusState, ParkedSession } from "./state.js";
import { addPending, applyNotification, threadFromSnapshot } from "./thread.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

interface Helpers {
  guard(work: () => Promise<void>): Promise<void>;
  refreshTasks(): Promise<void>;
}

/** What to answer a request nobody can see, so the agent is never left blocked on it. */
export function unanswerable(method: string): unknown {
  return method === "tool/requestUserInput" ? { selected: [] } : { decision: "decline" };
}

/** Whether the shown thread still has something going, so leaving it must not stop it. */
export function busy(state: AbacusState): boolean {
  const { phase, server, thread } = state;
  if (phase !== "ready" || server === null || !thread) return false;
  return (
    thread.turnId !== null ||
    thread.pending.length > 0 ||
    (state.queued[thread.threadId]?.length ?? 0) > 0
  );
}

/** The parked server running `threadId`, if one is. */
function parkedServer(state: AbacusState, threadId: string): number | null {
  for (const [server, entry] of Object.entries(state.parked)) {
    if (entry.thread.threadId === threadId) return Number(server);
  }
  return null;
}

/** What a thread the window does not show is doing, for its sidebar row. */
export function backgroundState(
  state: AbacusState,
  threadId: string,
): "working" | "waiting" | null {
  const server = parkedServer(state, threadId);
  const thread = server === null ? null : state.parked[server]?.thread;
  if (!thread) return null;
  if (thread.pending.length > 0) return "waiting";
  return thread.turnId ? "working" : null;
}

function without<T>(record: Record<string, T>, key: string | number): Record<string, T> {
  const { [key]: _gone, ...rest } = record;
  return rest;
}

/** Park the shown thread: its server keeps running while the window moves on. */
export function park(get: Get, set: Set): void {
  const { server, workspace, thread, parked } = get();
  if (server === null || !workspace || !thread) return;
  set({ parked: { ...parked, [server]: { workspace, thread } } });
}

const SECTION_KEY = "abacus.sidebarSection";

/** The sidebar side the person left it on: Code unless they chose Chat. */
export function savedSection(): AbacusState["section"] {
  try {
    return localStorage.getItem(SECTION_KEY) === "chat" ? "chat" : "code";
  } catch {
    return "code";
  }
}

export function sessionActions(bridge: AbacusBridge, get: Get, set: Set, helpers: Helpers) {
  const { guard, refreshTasks } = helpers;
  const seen = (threadId: string) => set({ unread: without(get().unread, threadId) });
  const update = (server: number, entry: ParkedSession) =>
    set({ parked: { ...get().parked, [server]: entry } });
  const drop = (server: number) => set({ parked: without(get().parked, server) });

  /** Open a thread on the shown server, unless it is the one shown. */
  const resume = (threadId: string) =>
    guard(async () => {
      if (get().thread?.threadId === threadId) return seen(threadId);
      const snapshot = await bridge.request<ThreadSnapshot>("thread/resume", { threadId });
      set({ thread: threadFromSnapshot(snapshot) });
      seen(threadId);
    });

  /** Show a parked thread again, as it is now. */
  const activate = (server: number) =>
    guard(async () => {
      if (!get().parked[server]) return;
      const previous = get().server;
      const keep = busy(get());
      if (keep) park(get, set);
      // Until the switch lands, every frame folds into a parked view: the
      // one shown until now (when kept), and the one coming back.
      set({ server: null });
      try {
        await bridge.activateSession(server, keep);
      } catch (error) {
        drop(server);
        set({
          server: previous,
          parked: previous === null ? get().parked : without(get().parked, previous),
        });
        throw error;
      }
      const entry = get().parked[server];
      if (!entry) {
        // It stopped as the window switched to it.
        set({ phase: "welcome", workspace: null, thread: null });
        throw new Error("That thread's abacus stopped. Open it again.");
      }
      set({
        server,
        workspace: entry.workspace,
        thread: entry.thread,
        parked: without(get().parked, server),
        phase: "ready",
        view: "chat",
      });
      seen(entry.thread.threadId);
      await Promise.all([get().refreshThreads(), refreshTasks()]);
    });

  /** A frame from a parked server, folded into its thread. */
  function onParked(message: ServerMessage & { server: number }) {
    const { server } = message;
    const entry = get().parked[server];
    if (!entry) {
      if (message.kind === "request")
        void bridge.respond(message.id, unanswerable(message.method), server);
      return;
    }
    const title = entry.thread.name || "A thread";
    if (message.kind === "exit") {
      drop(server);
      if (entry.thread.turnId) get().notify(`${title} stopped while it worked.`, "warning");
      return;
    }
    if (message.kind === "request") {
      const request = classifyRequest(message.id, message.method, message.params);
      if (!request) {
        void bridge.respond(message.id, unanswerable(message.method), server);
        return;
      }
      update(server, { ...entry, thread: addPending(entry.thread, request) });
      return;
    }
    if (message.method === "warning") {
      const text = (message.params as { message?: string }).message ?? "warning";
      get().notify(`${title}: ${text}`, "warning");
      return;
    }
    const thread = applyNotification(entry.thread, message.method, message.params);
    update(server, { ...entry, thread });
    if (message.method !== "turn/completed") return;
    void get().refreshProjects();
    if ((message.params as Notifications["turn/completed"]).continues) return;
    set({ unread: { ...get().unread, [thread.threadId]: true } });
    // Nothing left for it to do: its thread is saved, and opening it again
    // reads it from there.
    if (thread.pending.length === 0 && (get().queued[thread.threadId]?.length ?? 0) === 0) {
      drop(server);
      void bridge.stopSession(server);
    }
  }

  const actions: Pick<
    AbacusState,
    "openSession" | "newThreadIn" | "newThread" | "openThread" | "setSection"
  > = {
    setSection(section) {
      set({ section });
      try {
        localStorage.setItem(SECTION_KEY, section);
      } catch {
        // A window without storage just starts on Code next time.
      }
    },

    async openSession(path, threadId) {
      set({ view: "chat" });
      const parked = parkedServer(get(), threadId);
      if (parked !== null) return activate(parked);
      const state = get();
      if (busy(state) || state.workspace?.workspace !== path || state.phase !== "ready") {
        if (state.thread?.threadId === threadId && state.phase === "ready") return;
        await get().openWorkspace(path);
        if (get().phase !== "ready") return;
      }
      await resume(threadId);
    },

    async openThread(threadId) {
      const path = get().workspace?.workspace;
      if (path) await get().openSession(path, threadId);
    },

    async newThreadIn(path) {
      set({ view: "chat" });
      // A freshly started app server opens on a new thread already.
      if (busy(get()) || get().workspace?.workspace !== path || get().phase !== "ready")
        return get().openWorkspace(path);
      await get().newThread();
    },

    newThread: () =>
      guard(async () => {
        const path = get().workspace?.workspace;
        if (path && busy(get())) return get().openWorkspace(path);
        const snapshot = await bridge.request<ThreadSnapshot>("thread/start");
        set({ thread: threadFromSnapshot(snapshot), view: "chat" });
      }),
  };

  return { actions, onParked };
}
