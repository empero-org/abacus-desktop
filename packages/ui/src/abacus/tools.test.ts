import { describe, expect, it } from "vitest";
import { toolSubject, toolVerb } from "./tools.js";

describe("toolVerb", () => {
  it("speaks a built-in tool's own verb at each status", () => {
    expect(toolVerb("read_file", "functionCall", "inProgress")).toBe("Reading");
    expect(toolVerb("read_file", "functionCall", "completed")).toBe("Read");
    expect(toolVerb("run_command", "commandExecution", "awaitingApproval")).toBe("Wants to run");
    expect(toolVerb("edit_file", "fileChange", "aborted")).toBe("Stopped: edit");
  });

  it("falls back to the item type for tools it does not know", () => {
    expect(toolVerb("mcp__linear__create_issue", "functionCall", "completed")).toBe("Called");
    expect(toolVerb("custom_shell", "commandExecution", "inProgress")).toBe("Running");
  });
});

describe("toolSubject", () => {
  it("prefers the call's summary", () => {
    expect(toolSubject("read_file", " src/lib.rs ")).toBe("src/lib.rs");
  });

  it("names an unknown tool that has no summary, and leaves a known one bare", () => {
    expect(toolSubject("mcp__linear__create_issue", undefined)).toBe("mcp__linear__create_issue");
    expect(toolSubject("git_status", "")).toBe("");
  });
});
