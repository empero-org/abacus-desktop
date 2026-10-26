import { describe, expect, it, vi } from "vitest";
import type { ReasoningEffort } from "./protocol.js";
import type { AbacusState } from "./state.js";
import { nextEffort, runWindowCommand } from "./windowCommands.js";

function fakeState() {
  return {
    thread: { mode: "auto" },
    newThread: vi.fn(async () => {}),
    setView: vi.fn(),
    compact: vi.fn(async () => {}),
    setMode: vi.fn(async () => {}),
    setReasoningEffort: vi.fn(async () => {}),
    setModel: vi.fn(async () => {}),
    renameThread: vi.fn(async () => {}),
    notify: vi.fn(),
  } as unknown as AbacusState & Record<string, ReturnType<typeof vi.fn>>;
}

describe("window commands", () => {
  it("carries out the window's commands with their arguments", async () => {
    const state = fakeState();
    expect(await runWindowCommand(state, "mode", "Plan")).toBe(true);
    expect(state.setMode).toHaveBeenCalledWith("plan");
    await runWindowCommand(state, "effort", "auto");
    expect(state.setReasoningEffort).toHaveBeenCalledWith(null);
    await runWindowCommand(state, "plan", "");
    expect(state.setMode).toHaveBeenLastCalledWith("plan");
    await runWindowCommand(state, "model", "");
    expect(state.setView).toHaveBeenCalledWith("settings");
  });

  it("explains a bad argument instead of guessing", async () => {
    const state = fakeState();
    expect(await runWindowCommand(state, "mode", "fast")).toBe(true);
    expect(state.setMode).not.toHaveBeenCalled();
    expect(state.notify).toHaveBeenCalledWith("Choose a mode: auto, plan, build.", "warning");
  });

  it("leaves skills, plugin commands and /btw to the app server", async () => {
    const state = fakeState();
    expect(await runWindowCommand(state, "review", "the parser")).toBe(false);
    expect(await runWindowCommand(state, "btw", "also tests")).toBe(false);
  });
});

describe("Ctrl+T", () => {
  it("steps default, low, medium, high and back to default", () => {
    const seen: (ReasoningEffort | null)[] = [];
    let effort: ReasoningEffort | null = null;
    for (let press = 0; press < 4; press++) {
      effort = nextEffort(effort);
      seen.push(effort);
    }
    expect(seen).toEqual(["low", "medium", "high", null]);
  });

  it("brings a level off the ladder back onto it", () => {
    expect(nextEffort("minimal")).toBe("low");
    expect(nextEffort("xhigh")).toBe(null);
    expect(nextEffort("max")).toBe(null);
  });
});
