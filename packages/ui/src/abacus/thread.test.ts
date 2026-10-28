import { describe, expect, it } from "vitest";
import type { ThreadSnapshot } from "./protocol.js";
import {
  addPending,
  applyNotification,
  isWorking,
  resolvePending,
  threadFromSnapshot,
  withCommandOutput,
} from "./thread.js";

const snapshot: ThreadSnapshot = {
  threadId: "t1",
  name: "New session",
  model: "test/test-model",
  profile: "test/test-model",
  mode: "auto",
  reasoningEffort: null,
  workspace: "/work",
  contextWindow: 128_000,
  tokensUsed: 0,
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    uncachedInput: 0,
    cacheRate: null,
    total: 0,
  },
  items: [],
};

function run(...frames: [string, unknown][]) {
  return frames.reduce(
    (thread, [method, params]) => applyNotification(thread, method, params),
    threadFromSnapshot(snapshot),
  );
}

describe("applyNotification", () => {
  it("follows the goal, and has none when the CLI does not say", () => {
    expect(threadFromSnapshot(snapshot).goal).toBeNull();
    const goal = { objective: "Ship it", status: "active", iterations: 0, note: null };
    const set = run(["thread/goal/updated", { threadId: "t1", goal }]);
    expect(set.goal).toEqual(goal);
    const paused = applyNotification(set, "thread/goal/updated", {
      threadId: "t1",
      goal: { ...goal, status: "paused", iterations: 2 },
    });
    expect(paused.goal?.status).toBe("paused");
    // Another thread's goal is not this one's.
    expect(
      applyNotification(paused, "thread/goal/updated", { threadId: "t2", goal: null }).goal,
    ).toEqual(paused.goal);
    expect(
      applyNotification(paused, "thread/goal/updated", { threadId: "t1", goal: null }).goal,
    ).toBeNull();
  });

  it("follows the task list", () => {
    expect(threadFromSnapshot(snapshot).taskList).toEqual([]);
    const tasks = [
      { text: "write tests", done: true },
      { text: "run lint", done: false },
    ];
    expect(run(["thread/taskList/updated", { threadId: "t1", tasks }]).taskList).toEqual(tasks);
  });

  it("streams an agent message and lets item/completed have the last word", () => {
    const thread = run(
      ["turn/started", { threadId: "t1", turnId: "turn_1" }],
      [
        "item/started",
        {
          threadId: "t1",
          turnId: "turn_1",
          item: { id: "item_1", type: "agentMessage", text: "" },
        },
      ],
      [
        "item/agentMessage/delta",
        { threadId: "t1", turnId: "turn_1", itemId: "item_1", delta: "Hel" },
      ],
      [
        "item/agentMessage/delta",
        { threadId: "t1", turnId: "turn_1", itemId: "item_1", delta: "lo" },
      ],
    );
    expect(thread.items).toEqual([{ id: "item_1", type: "agentMessage", text: "Hello" }]);
    expect(thread.turnId).toBe("turn_1");

    const done = applyNotification(thread, "item/completed", {
      threadId: "t1",
      turnId: "turn_1",
      item: { id: "item_1", type: "agentMessage", text: "Hello there" },
    });
    expect(done.items).toEqual([{ id: "item_1", type: "agentMessage", text: "Hello there" }]);
  });

  it("opens an item for a delta that arrives before its item/started", () => {
    const thread = run([
      "item/reasoning/textDelta",
      { threadId: "t1", itemId: "r1", delta: "thinking" },
    ]);
    expect(thread.items).toEqual([{ id: "r1", type: "reasoning", text: "thinking" }]);
  });

  it("moves a tool call from awaiting approval to completed with its output", () => {
    const thread = run(
      [
        "item/started",
        {
          threadId: "t1",
          item: {
            id: "c1",
            type: "commandExecution",
            name: "run_command",
            command: "cargo test",
            status: "awaitingApproval",
          },
        },
      ],
      [
        "item/completed",
        {
          threadId: "t1",
          item: {
            id: "c1",
            type: "commandExecution",
            name: "run_command",
            command: "cargo test",
            status: "completed",
            output: "ok",
          },
        },
      ],
    );
    expect(thread.items).toHaveLength(1);
    expect(thread.items[0]).toMatchObject({ status: "completed", output: "ok" });
  });

  it("ignores frames for another thread", () => {
    const thread = run(["thread/name/updated", { threadId: "other", name: "Not mine" }]);
    expect(thread.name).toBe("New session");
  });

  it("ends a turn, clears what was waiting, and takes the turn's name", () => {
    const waiting = addPending(run(["turn/started", { threadId: "t1", turnId: "turn_1" }]), {
      kind: "question",
      id: "srv_1",
      method: "tool/requestUserInput",
      params: {
        threadId: "t1",
        turnId: "turn_1",
        question: "Which?",
        options: ["a", "b"],
        multiSelect: false,
      },
    });
    expect(isWorking(waiting)).toBe(false);
    const done = applyNotification(waiting, "turn/completed", {
      threadId: "t1",
      turnId: "turn_1",
      status: "completed",
      name: "Fix the parser",
    });
    expect(done.turnId).toBeNull();
    expect(done.pending).toEqual([]);
    expect(done.name).toBe("Fix the parser");
    expect(done.lastTurnStatus).toBe("completed");
  });

  it("records usage, mode, and the turn's changed files", () => {
    const usage = {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      uncachedInput: 10,
      cacheRate: null,
      total: 15,
    };
    const thread = run(
      [
        "thread/tokenUsage/updated",
        { threadId: "t1", tokensUsed: 15, contextTokens: 12, contextWindow: 200_000, usage },
      ],
      ["thread/mode/updated", { threadId: "t1", mode: "yolo" }],
      [
        "turn/diff/updated",
        {
          threadId: "t1",
          turnId: "turn_1",
          files: [{ path: "src/a.rs", added: 3, removed: 1, binary: false }],
        },
      ],
    );
    expect(thread.tokensUsed).toBe(15);
    expect(thread.contextTokens).toBe(12);
    expect(thread.contextWindow).toBe(200_000);
    expect(thread.mode).toBe("yolo");
    expect(thread.changedFiles[0]?.path).toBe("src/a.rs");
  });

  it("follows the profile the session switches to", () => {
    const thread = run([
      "thread/profile/updated",
      {
        profile: "fast",
        model: "llama/qwen-3-4b",
        mode: "auto",
        reasoningEffort: "low",
        contextWindow: 32_000,
      },
    ]);
    expect(thread.profile).toBe("fast");
    expect(thread.model).toBe("llama/qwen-3-4b");
    expect(thread.reasoningEffort).toBe("low");
    expect(thread.contextWindow).toBe(32_000);
    // A window the CLI does not know keeps the one there was.
    const unknown = run([
      "thread/profile/updated",
      { profile: "x", model: "a/b", mode: "auto", reasoningEffort: null },
    ]);
    expect(unknown.contextWindow).toBe(128_000);
  });

  it("marks where the thread was compacted while idle", () => {
    const thread = run(
      ["thread/compacted", { threadId: "t1", reason: "idle", savedTokens: 398_900 }],
      ["thread/compacted", { threadId: "t1", reason: "idle", savedTokens: 120_000 }],
      ["thread/compacted", { threadId: "other", reason: "idle", savedTokens: 1 }],
    );
    expect(thread.items).toEqual([
      { id: "compaction_0", type: "contextCompaction", savedTokens: 398_900 },
      { id: "compaction_1", type: "contextCompaction", savedTokens: 120_000 },
    ]);
  });
});

describe("command output", () => {
  it("joins the transcript where it was asked, and the turn's items follow it", () => {
    const asked = withCommandOutput(
      threadFromSnapshot(snapshot),
      "memory",
      "No memories here yet.",
    );
    const thread = applyNotification(asked, "item/completed", {
      threadId: "t1",
      turnId: "turn_1",
      completedAtMs: 0,
      item: { id: "item_1", type: "userMessage", text: "go on" },
    });
    expect(thread.items.map((item) => item.type)).toEqual(["commandOutput", "userMessage"]);
    expect(thread.items[0]).toEqual({
      id: "command_0",
      type: "commandOutput",
      command: "memory",
      text: "No memories here yet.",
    });
  });
});

describe("pending requests", () => {
  it("queues each request once and drops it when answered", () => {
    const base = threadFromSnapshot(snapshot);
    const request = {
      kind: "approval" as const,
      id: "srv_2",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "t1",
        turnId: "x",
        itemId: "c1",
        startedAtMs: 0,
        tool: "run_command",
        command: "rm -rf build",
        cwd: "/work",
        availableDecisions: ["accept" as const, "decline" as const],
      },
    };
    const queued = addPending(addPending(base, request), request);
    expect(queued.pending).toHaveLength(1);
    expect(resolvePending(queued, "srv_2").pending).toHaveLength(0);
  });
});
