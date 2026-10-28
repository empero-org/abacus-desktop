import { describe, expect, it } from "vitest";
import { shownInBar, standsAlone, toolSubject, toolVerb } from "./tools.js";

describe("toolVerb", () => {
  it("speaks a built-in tool's own verb at each status", () => {
    expect(toolVerb("read_file", "functionCall", "inProgress")).toBe("Reading");
    expect(toolVerb("read_file", "functionCall", "completed")).toBe("Read");
    expect(toolVerb("run_command", "commandExecution", "awaitingApproval")).toBe("Wants to run");
    expect(toolVerb("edit_file", "fileChange", "aborted")).toBe("Stopped: edit");
    expect(toolVerb("run_command", "commandExecution", "declined")).toBe("Did not run");
    expect(toolVerb("browser_type", "functionCall", "awaitingApproval")).toBe("Wants to type into");
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

  it("leaves the name off a tool whose verb says it all", () => {
    expect(standsAlone("browser_screenshot")).toBe(true);
    expect(standsAlone("git_status")).toBe(false);
  });
});

describe("shownInBar", () => {
  it("leaves goal and task-list calls to their bars once the CLI reports them", () => {
    expect(shownInBar("task_create", { taskList: true })).toBe(true);
    expect(shownInBar("goal_update", { goal: true })).toBe(true);
    // An abacus that does not report them has no bar to show them in.
    expect(shownInBar("task_update", { goal: true })).toBe(false);
    expect(shownInBar("run_command", { goal: true, taskList: true })).toBe(false);
  });
});
