import { describe, expect, it } from "vitest";
import { elapsed, tokenCount } from "./format.js";
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
