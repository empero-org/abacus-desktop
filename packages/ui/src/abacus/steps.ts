// The transcript reads as what was said, with the work in between folded:
// each run of steps (the agent thinking, or calling a tool) between one
// message and the next becomes one group the person can open.

import type { Item } from "./protocol.js";

export type Entry = { kind: "item"; item: Item } | { kind: "steps"; id: string; items: Item[] };

/** The agent thinking or calling a tool; a message, or a line the window adds, is not one. */
function isStep(item: Item): boolean {
  switch (item.type) {
    case "userMessage":
    case "agentMessage":
    case "contextCompaction":
    case "commandOutput":
      return false;
    default:
      return true;
  }
}

/**
 * The items as the transcript lays them out: every run of two or more steps
 * as one group, named after its first step so it keeps its place (and
 * whether it is open) as the run grows. A lone step stays a line of its own.
 * A reply with no words yet shows nothing, so it does not split a run.
 */
export function groupSteps(items: Item[]): Entry[] {
  const entries: Entry[] = [];
  let run: Item[] = [];
  const close = () => {
    if (run.length > 1) entries.push({ kind: "steps", id: run[0]!.id, items: run });
    else if (run.length === 1) entries.push({ kind: "item", item: run[0]! });
    run = [];
  };
  for (const item of items) {
    if (item.type === "agentMessage" && !item.text.trim()) continue;
    if (isStep(item)) {
      run.push(item);
    } else {
      close();
      entries.push({ kind: "item", item });
    }
  }
  close();
  return entries;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** A folded run in a few words: "6 steps", and what they were, "2 commands · 1 file edit". */
export function stepSummary(items: Item[]): { label: string; detail: string } {
  const count = (type: Item["type"]) => items.filter((item) => item.type === type).length;
  const detail = [
    [count("commandExecution"), "command", "commands"],
    [count("fileChange"), "file edit", "file edits"],
    [count("functionCall"), "tool call", "tool calls"],
  ] as const;
  return {
    label: plural(items.length, "step", "steps"),
    detail: detail
      .filter(([n]) => n > 0)
      .map(([n, one, many]) => plural(n, one, many))
      .join(" · "),
  };
}
