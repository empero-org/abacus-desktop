import { describe, expect, it } from "vitest";
import { compactNumber, compactionLabel, elapsed, thoughtTitle, tokenCount } from "./format.js";
import { toolActivity } from "./tools.js";

describe("task figures", () => {
  it("reads elapsed time the way the task panel shows it", () => {
    expect(elapsed(42_400)).toBe("42s");
    expect(elapsed(429_000)).toBe("7m 09s");
    expect(elapsed(3_900_000)).toBe("1h 05m");
    expect(elapsed(-5)).toBe("0s");
  });

  it("shortens token counts", () => {
    expect(tokenCount(950)).toBe("950");
    expect(tokenCount(196_800)).toBe("196.8k");
    expect(tokenCount(2_400_000)).toBe("2.4M");
  });

  it("says what a worker is doing in words", () => {
    expect(toolActivity("run_command")).toBe("Running a command");
    expect(toolActivity("web_search")).toBe("Searching the web");
    expect(toolActivity("git_log")).toBe("Checking git");
    expect(toolActivity("mcp__linear__search")).toBe("Using mcp__linear__search");
    expect(toolActivity(null)).toBe("Thinking");
  });
});

describe("compaction dividers", () => {
  it("say how much of a reopened thread was summarised, and when it was only dropped", () => {
    const cut = { id: "history_2", type: "contextCompaction" as const, tokens: 92_000 };
    expect(compactionLabel({ ...cut, messages: 48, summarised: true })).toBe(
      `Earlier conversation summarised · 48 messages, about ${compactNumber(92_000)} tokens`,
    );
    expect(compactionLabel({ ...cut, messages: 1, summarised: false })).toBe(
      `Earlier conversation dropped to fit the context · 1 message, about ${compactNumber(92_000)} tokens`,
    );
  });

  it("keep the live line for a thread compacted while the person was away", () => {
    expect(
      compactionLabel({ id: "compaction_3", type: "contextCompaction", savedTokens: 398_900 }),
    ).toBe(`Compacted while you were away · saved ${compactNumber(398_900)} tokens`);
  });
});

describe("thoughtTitle", () => {
  it("takes the heading a model opens its reasoning with", () => {
    expect(thoughtTitle("**Checking the queue**\n\nThe bar sits above the composer.")).toBe(
      "Checking the queue",
    );
    expect(thoughtTitle("## **Planning**\nfirst")).toBe("Planning");
  });

  it("else takes the first sentence, without markdown", () => {
    expect(thoughtTitle("The user wants a bar. It goes above the queue.")).toBe(
      "The user wants a bar.",
    );
    expect(thoughtTitle("Look at `QueueBar.tsx` first\nthen the store")).toBe(
      "Look at QueueBar.tsx first",
    );
    expect(thoughtTitle("Version 0.7.5 ships it")).toBe("Version 0.7.5 ships it");
    expect(thoughtTitle("   ")).toBe("");
  });
});
