import { describe, expect, it, vi } from "vitest";
import type { AbacusBridge, ServerMessage } from "./bridge.js";
import type { ThreadSnapshot } from "./protocol.js";
import { backgroundState, busy, park, sessionActions } from "./sessionActions.js";
import type { AbacusState } from "./state.js";
import { threadFromSnapshot, type ThreadView } from "./thread.js";

function thread(threadId: string, extra: Partial<ThreadView> = {}): ThreadView {
  const snapshot = { threadId, name: `Thread ${threadId}`, items: [] } as unknown as ThreadSnapshot;
  return { ...threadFromSnapshot(snapshot), ...extra };
}

/** Just enough of the store for the session actions: state, set, and a notice log. */
function harness(initial: Partial<AbacusState>) {
  let state = {
    phase: "ready",
    server: 1,
    workspace: { workspace: "/work/a", name: "a", server: 1 },
    thread: null,
    parked: {},
    unread: {},
    queued: {},
    notices: [],
    notify: vi.fn(),
    refreshProjects: vi.fn(async () => {}),
    refreshThreads: vi.fn(async () => {}),
    ...initial,
  } as unknown as AbacusState;
  const get = () => state;
  const set = (partial: Partial<AbacusState>) => {
    state = { ...state, ...partial };
  };
  const switching: { land?: () => void } = {};
  const bridge = {
    respond: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
    // Lands when the test says, so frames can arrive mid-switch.
    activateSession: vi.fn(
      () =>
        new Promise((resolve) => {
          switching.land = () => resolve({ workspace: "/work/a", name: "a" });
        }),
    ),
  } as unknown as AbacusBridge;
  const sessions = sessionActions(bridge, get, set, {
    guard: async (work) => work(),
    refreshTasks: async () => {},
  });
  const parked = (message: ServerMessage & { server: number }) => sessions.onParked(message);
  return { get, set, bridge, parked, sessions, switching };
}

describe("several threads at once", () => {
  it("keeps a thread's server only while it still has something going", () => {
    const idle = harness({ thread: thread("a") });
    expect(busy(idle.get())).toBe(false);
    expect(busy(harness({ thread: thread("a", { turnId: "turn-1" }) }).get())).toBe(true);
    const asking = thread("a", {
      pending: [{ kind: "question", id: 3, method: "tool/requestUserInput", params: {} }],
    } as unknown as Partial<ThreadView>);
    expect(busy(harness({ thread: asking }).get())).toBe(true);
    const queued = harness({
      thread: thread("a"),
      queued: { a: [{ id: 1, text: "next", attachments: [] }] },
    });
    expect(busy(queued.get())).toBe(true);
    // A crashed window has nothing left to keep.
    expect(busy(harness({ phase: "crashed", thread: thread("a", { turnId: "t" }) }).get())).toBe(
      false,
    );
  });

  it("folds a parked thread's frames into it, and lets it go once it is done", () => {
    const { get, set, bridge, parked } = harness({ thread: thread("a", { turnId: "turn-1" }) });
    park(get, set);
    set({ server: 2, thread: thread("b") });
    expect(backgroundState(get(), "a")).toBe("working");

    parked({
      kind: "notification",
      method: "item/completed",
      params: { threadId: "a", item: { id: "i1", type: "agentMessage", text: "Done reading." } },
      server: 1,
    });
    expect(get().parked[1]?.thread.items.at(-1)).toMatchObject({ text: "Done reading." });

    parked({
      kind: "notification",
      method: "turn/completed",
      params: { threadId: "a", turnId: "turn-1", status: "completed" },
      server: 1,
    });
    expect(get().unread).toEqual({ a: true });
    expect(get().parked[1]).toBeUndefined();
    expect(bridge.stopSession).toHaveBeenCalledWith(1);
    // The shown thread is untouched.
    expect(get().thread?.threadId).toBe("b");
  });

  it("holds a parked thread that asks the person, and keeps one whose goal goes on", () => {
    const { get, set, bridge, parked } = harness({ thread: thread("a", { turnId: "turn-1" }) });
    park(get, set);
    set({ server: 2, thread: thread("b") });
    parked({
      kind: "request",
      id: "srv-1",
      method: "tool/requestUserInput",
      params: { threadId: "a", questions: [] },
      server: 1,
    });
    expect(backgroundState(get(), "a")).toBe("waiting");

    parked({
      kind: "notification",
      method: "turn/completed",
      params: { threadId: "a", turnId: "turn-1", status: "completed", continues: true },
      server: 1,
    });
    expect(get().parked[1]).toBeDefined();
    expect(bridge.stopSession).not.toHaveBeenCalled();
  });

  it("loses nothing that arrives while the window switches back to a parked thread", async () => {
    const { get, set, parked, sessions, switching } = harness({
      thread: thread("a", { turnId: "turn-1" }),
    });
    park(get, set);
    set({ server: 2, thread: thread("b", { turnId: "turn-2" }) });

    const switched = sessions.actions.openSession("/work/a", "a");
    await Promise.resolve();
    // From both: the thread coming back, and the one now being parked.
    for (const [server, threadId] of [
      [1, "a"],
      [2, "b"],
    ] as const) {
      parked({
        kind: "notification",
        method: "item/completed",
        params: { threadId, item: { id: `late-${threadId}`, type: "agentMessage", text: "late" } },
        server,
      });
    }
    switching.land?.();
    await switched;

    expect(get().server).toBe(1);
    expect(get().thread?.items.at(-1)?.id).toBe("late-a");
    expect(get().parked[2]?.thread.items.at(-1)?.id).toBe("late-b");
    expect(get().parked[1]).toBeUndefined();
  });

  it("never leaves a server it let go of blocked on a question", () => {
    const { bridge, parked } = harness({ thread: thread("b") });
    parked({
      kind: "request",
      id: "srv-9",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "gone" },
      server: 7,
    });
    expect(bridge.respond).toHaveBeenCalledWith("srv-9", { decision: "decline" }, 7);
  });
});
