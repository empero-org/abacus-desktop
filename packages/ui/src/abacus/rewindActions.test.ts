import { describe, expect, it, vi } from "vitest";
import type { AbacusBridge } from "./bridge.js";
import type { Item, ThreadSnapshot } from "./protocol.js";
import { rewindActions, rewindPoints } from "./rewindActions.js";
import type { AbacusState } from "./state.js";
import { threadFromSnapshot } from "./thread.js";

type Message = Extract<Item, { type: "userMessage" }>;
const said = (id: string, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  type: "userMessage",
  text,
  ...extra,
});
const answer = (id: string): Item => ({ id, type: "agentMessage", text: "done" });

describe("rewindPoints", () => {
  it("counts the person's messages back from the end, and only theirs", () => {
    const items: Item[] = [
      said("a", "first"),
      answer("a1"),
      said("p", "tests pass", { from: { title: "perf", agent: true } }),
      said("g", "carry on", { goal: true, from: { title: "Goal", agent: true } }),
      said("b", "second"),
      answer("b1"),
    ];
    expect([...rewindPoints(items)]).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("offers nothing a compaction folded into its summary", () => {
    const items: Item[] = [
      said("a", "first"),
      { id: "c", type: "contextCompaction", savedTokens: 900 },
      said("b", "second"),
    ];
    expect([...rewindPoints(items)]).toEqual([["b", 1]]);
  });
});

function snapshot(threadId: string, extra: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return { threadId, name: threadId, items: [], ...extra } as unknown as ThreadSnapshot;
}

function harness(reply: ThreadSnapshot | Error) {
  const items: Item[] = [
    said("a", "first", { at: 1000 }),
    answer("a1"),
    said("b", "second", { at: 2000 }),
    answer("b1"),
  ];
  let state = {
    thread: { ...threadFromSnapshot(snapshot("t1")), items, contextTokens: 5000 },
    drafts: { t1: "" },
    attachments: {},
    view: "chat",
    notify: vi.fn(),
    refreshThreads: vi.fn(async () => {}),
  } as unknown as AbacusState;
  const get = () => state;
  const set = (partial: Partial<AbacusState>) => {
    state = { ...state, ...partial };
  };
  const request = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const bridge = { request } as unknown as AbacusBridge;
  const actions = rewindActions(bridge, get, set, (error) => String(error));
  return { get, request, actions, items };
}

describe("rewindActions", () => {
  it("goes back to before a message, keeps what came before as shown, and gives it back", async () => {
    const draft = { text: "second", images: ["data:image/png;base64,AAAA"], files: [] };
    const { get, request, actions, items } = harness(
      snapshot("t1", { contextTokens: 1200, draft }),
    );
    expect(await actions.rewindTo(items[2] as Message, 1)).toBe(true);
    expect(request).toHaveBeenCalledWith("thread/rewind", { back: 1, text: "second" });
    expect(get().thread?.items).toEqual(items.slice(0, 2));
    expect(get().thread?.contextTokens).toBe(1200);
    expect(get().drafts.t1).toBe("second");
    expect(get().attachments.t1).toMatchObject([
      { kind: "image", url: "data:image/png;base64,AAAA" },
    ]);
  });

  it("forks from a message into a session of its own, with the message to edit", async () => {
    const draft = { text: "first", images: [], files: [{ name: "a.rs", text: "fn a() {}" }] };
    const fork = snapshot("t2", { items: [], draft });
    const { get, request, actions, items } = harness(fork);
    expect(await actions.forkFrom(items[0] as Message, 2)).toBe(true);
    expect(request).toHaveBeenCalledWith("thread/fork", { back: 2, text: "first" });
    expect(get().thread?.threadId).toBe("t2");
    expect(get().drafts.t2).toBe("first");
    expect(get().attachments.t2).toMatchObject([{ kind: "file", name: "a.rs", text: "fn a() {}" }]);
    expect(get().drafts.t1).toBe("");
    expect(get().refreshThreads).toHaveBeenCalled();
  });

  it("changes nothing when the app server refuses, and says why", async () => {
    const { get, actions, items } = harness(new Error("the conversation has changed"));
    expect(await actions.rewindTo(items[2] as Message, 1)).toBe(false);
    expect(get().thread?.items).toEqual(items);
    expect(get().drafts.t1).toBe("");
    expect(get().notify).toHaveBeenCalledWith(
      expect.stringContaining("the conversation has changed"),
      "error",
    );
  });
});
