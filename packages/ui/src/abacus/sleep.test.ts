import { describe, expect, it, vi } from "vitest";
import type { AbacusBridge } from "./bridge.js";
import type { ThreadSnapshot } from "./protocol.js";
import { sleeping } from "./sleep.js";
import type { AbacusState } from "./state.js";
import { threadFromSnapshot } from "./thread.js";

function setup(asleep: boolean, { fresh = false } = {}) {
  const snapshot = {
    threadId: "t1",
    name: "Port the importer",
    items: [{ id: "i1", type: "agentMessage", text: "Ported half of it." }],
  } as unknown as ThreadSnapshot;
  let state = {
    asleep,
    server: asleep ? null : 1,
    workspace: { workspace: "/work/a", name: "a", server: 1 },
    thread: fresh ? { ...threadFromSnapshot(snapshot), items: [] } : threadFromSnapshot(snapshot),
    drafts: fresh ? { t1: "half-written" } : {},
    attachments: {},
    queued: {},
    sendingNow: {},
    appInfo: { version: "0.1.7" },
  } as unknown as AbacusState;
  const get = () => state;
  const set = (partial: Partial<AbacusState>) => {
    state = { ...state, ...partial };
  };
  const calls: string[] = [];
  const bridge = {
    openWorkspace: vi.fn(async (path: string) => {
      calls.push(`open ${path}`);
      return { workspace: path, name: "a", server: 2 };
    }),
    request: vi.fn(async (method: string) => {
      calls.push(method);
      if (method === "thread/resume") return { ...snapshot, name: "Port the importer, saved" };
      if (method === "initialize") return { thread: { threadId: "t2", name: "", items: [] } };
      return {};
    }),
  } as unknown as AbacusBridge;
  return { ...sleeping(bridge, get, set), get, calls };
}

describe("a sleeping thread", () => {
  it("wakes for the next request: server, initialize, the thread reopened, then the request", async () => {
    const { live, get, calls } = setup(true);
    await Promise.all([live.request("turn/start", { text: "go on" }), live.request("tasks/list")]);
    expect(calls.slice(0, 3)).toEqual(["open /work/a", "initialize", "thread/resume"]);
    expect(calls.filter((call) => call.startsWith("open"))).toHaveLength(1);
    expect(calls).toContain("turn/start");
    expect(get().asleep).toBe(false);
    expect(get().server).toBe(2);
    expect(get().thread?.name).toBe("Port the importer, saved");
  });

  it("still wakes after being asked while awake", async () => {
    const { live, wake, get, calls } = setup(false);
    await wake();
    get().asleep = true;
    await live.request("turn/start");
    expect(calls.slice(0, 3)).toEqual(["open /work/a", "initialize", "thread/resume"]);
  });

  it("brings a thread nothing was sent in back as the server's new one, with the draft", async () => {
    const { live, get, calls } = setup(true, { fresh: true });
    await live.request("turn/start");
    expect(calls).not.toContain("thread/resume");
    expect(get().thread?.threadId).toBe("t2");
    expect(get().drafts).toEqual({ t2: "half-written" });
  });

  it("leaves an awake server, and a request to a named one, alone", async () => {
    const awake = setup(false);
    await awake.live.request("tasks/list");
    expect(awake.calls).toEqual(["tasks/list"]);

    const parked = setup(true);
    await parked.live.request("turn/interrupt", {}, 7);
    expect(parked.calls).toEqual(["turn/interrupt"]);
  });
});
