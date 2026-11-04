// The transcript reads as what was said, with the work in between folded:
// each run of steps (the agent thinking, or calling a tool) between one
// message and the next becomes one group the person can open.

import type { Item } from "./protocol.js";

export type Entry = { kind: "item"; item: Item } | { kind: "steps"; id: string; items: Item[] };

/**
 * The agent thinking or calling a tool. A message, a line the window adds,
 * what a turn edited, and the files the agent showed are not: they stay in view.
 */
function isStep(item: Item): boolean {
  switch (item.type) {
    case "userMessage":
    case "agentMessage":
    case "contextCompaction":
    case "commandOutput":
    case "fileEdits":
      return false;
    default:
      return !isPresentedFiles(item);
  }
}

/** A `present_files` call that showed files: drawn as their cards. */
export function isPresentedFiles(item: Item): boolean {
  return (
    "name" in item &&
    item.name === "present_files" &&
    item.status === "completed" &&
    presentedPaths(item.output ?? "").length > 0
  );
}

/** The files a `present_files` call showed, from its answer: one `- /path` line each. */
export function presentedPaths(output: string): string[] {
  const [first, ...rest] = output.split("\n");
  if (first?.trim() !== "Shown to the person as file cards:") return [];
  return rest.filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
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
