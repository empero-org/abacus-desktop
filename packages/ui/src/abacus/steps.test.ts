import { describe, expect, it } from "vitest";
import type { Item } from "./protocol.js";
import { groupSteps, stepSummary } from "./steps.js";

const user = (id: string): Item => ({ id, type: "userMessage", text: "hi" });
const said = (id: string, text = "done"): Item => ({ id, type: "agentMessage", text });
const thought = (id: string): Item => ({ id, type: "reasoning", text: "hmm" });
const ran = (id: string): Item => ({
  id,
  type: "commandExecution",
  name: "run_command",
  command: "cargo test",
  status: "completed",
});
const edited = (id: string): Item => ({
  id,
  type: "fileChange",
  name: "edit_file",
  command: "src/lib.rs",
  status: "completed",
});

const shape = (items: Item[]) =>
  groupSteps(items).map((entry) =>
    entry.kind === "item" ? entry.item.id : `[${entry.items.map((item) => item.id).join(",")}]`,
  );

describe("groupSteps", () => {
  it("folds each run of steps between messages, keeping lone steps as they are", () => {
    expect(
      shape([
        user("u1"),
        thought("r1"),
        ran("c1"),
        edited("e1"),
        said("a1"),
        ran("c2"),
        said("a2"),
        thought("r2"),
        ran("c3"),
      ]),
    ).toEqual(["u1", "[r1,c1,e1]", "a1", "c2", "a2", "[r2,c3]"]);
  });

  it("names a group after its first step, so it stays put as the run grows", () => {
    const first = groupSteps([user("u1"), thought("r1"), ran("c1")]);
    const later = groupSteps([user("u1"), thought("r1"), ran("c1"), ran("c2")]);
    expect(first[1]).toMatchObject({ kind: "steps", id: "r1" });
    expect(later[1]).toMatchObject({ kind: "steps", id: "r1" });
  });

  it("does not let a reply with no words yet split a run", () => {
    expect(shape([ran("c1"), said("a1", " "), ran("c2")])).toEqual(["[c1,c2]"]);
  });
});

describe("stepSummary", () => {
  it("counts the steps and says what they were", () => {
    expect(stepSummary([thought("r1"), ran("c1"), ran("c2"), edited("e1")])).toEqual({
      label: "4 steps",
      detail: "2 commands · 1 file edit",
    });
  });
});
