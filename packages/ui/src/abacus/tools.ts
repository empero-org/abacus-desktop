// How a tool call reads in the transcript: "Read src/lib.rs", "Ran cargo test".
// Names are abacus's built-in tools; anything else (MCP, plugins) falls back to
// a generic verb by item type.

import type { ToolItemType, ToolStatus } from "./protocol.js";

/** [doing, done, to-do] */
type Verbs = readonly [string, string, string];

const BUILT_IN: Record<string, Verbs> = {
  run_command: ["Running", "Ran", "run"],
  read_file: ["Reading", "Read", "read"],
  read_files: ["Reading", "Read", "read"],
  list_files: ["Listing", "Listed", "list"],
  glob: ["Finding", "Found", "find"],
  grep: ["Searching", "Searched", "search"],
  read_page: ["Reading", "Read", "read"],
  web_search: ["Searching the web for", "Searched the web for", "search the web for"],
  tool_search: ["Looking up", "Looked up", "look up"],
  edit_file: ["Editing", "Edited", "edit"],
  write_file: ["Writing", "Wrote", "write"],
  append_file: ["Appending to", "Appended to", "append to"],
  apply_patch: ["Patching", "Patched", "patch"],
  delete_file: ["Deleting", "Deleted", "delete"],
  move_file: ["Moving", "Moved", "move"],
  create_directory: ["Creating", "Created", "create"],
  git_status: ["Checking", "Checked", "check"],
  git_diff: ["Diffing", "Diffed", "diff"],
  git_log: ["Reading history of", "Read history of", "read the history of"],
  git_show: ["Showing", "Showed", "show"],
  git_blame: ["Blaming", "Blamed", "blame"],
  git_commit: ["Committing", "Committed", "commit"],
  git_checkout: ["Checking out", "Checked out", "check out"],
  git_restore: ["Restoring", "Restored", "restore"],
  spawn_subagents: ["Starting subagents", "Started subagents", "start subagents"],
  message_subagent: ["Messaging", "Messaged", "message"],
  mode_set: ["Switching mode", "Switched mode", "switch mode"],
  ask_user: ["Asking", "Asked", "ask"],
  // The desktop's own browser tools.
  browser_navigate: ["Opening", "Opened", "open"],
  browser_read_page: ["Reading the page", "Read the page", "read the page"],
  browser_click: ["Clicking", "Clicked", "click"],
  browser_type: ["Typing into", "Typed into", "type into"],
  browser_press_key: ["Pressing", "Pressed", "press"],
  browser_scroll: ["Scrolling", "Scrolled", "scroll"],
  browser_back: ["Going back", "Went back", "go back"],
  browser_screenshot: ["Taking a screenshot", "Took a screenshot", "take a screenshot"],
};

const BY_TYPE: Record<ToolItemType, Verbs> = {
  commandExecution: ["Running", "Ran", "run"],
  fileChange: ["Editing", "Edited", "edit"],
  functionCall: ["Calling", "Called", "call"],
};

export function toolVerb(name: string, type: ToolItemType, status: ToolStatus): string {
  const [doing, done, toDo] = BUILT_IN[name] ?? BY_TYPE[type];
  switch (status) {
    case "awaitingApproval":
      return `Wants to ${toDo}`;
    case "inProgress":
      return doing;
    case "completed":
      return done;
    case "aborted":
      return `Stopped: ${toDo}`;
    case "declined":
      return `Did not ${toDo}`;
  }
}

/** Tools whose verb says it all: "Read the page", "Took a screenshot", "Went back". */
const STANDS_ALONE = new Set(["browser_read_page", "browser_screenshot", "browser_back"]);

export function standsAlone(name: string): boolean {
  return STANDS_ALONE.has(name);
}

/** What the call was about: its summary, or the tool's name for an unknown tool without one. */
export function toolSubject(name: string, command: string | undefined): string {
  const summary = command?.trim();
  if (summary) return summary;
  return BUILT_IN[name] ? "" : name;
}

const ACTIVITY: Record<string, string> = {
  run_command: "Running a command",
  web_search: "Searching the web",
  read_page: "Reading a web page",
  read_file: "Reading files",
  read_files: "Reading files",
  list_files: "Looking through files",
  glob: "Looking through files",
  grep: "Searching the code",
  edit_file: "Editing files",
  write_file: "Editing files",
  append_file: "Editing files",
  apply_patch: "Editing files",
  delete_file: "Editing files",
  move_file: "Editing files",
  create_directory: "Editing files",
  git_commit: "Committing",
  spawn_subagents: "Starting subagents",
  ask_user: "Asking a question",
  mode_set: "Switching mode",
  tool_search: "Looking up tools",
};

/** What a worker is doing, in words: the tool it is in, or thinking between tools. */
export function toolActivity(tool: string | null): string {
  if (!tool) return "Thinking";
  if (ACTIVITY[tool]) return ACTIVITY[tool];
  if (tool.startsWith("git_")) return "Checking git";
  if (tool.startsWith("browser_")) return "Using the browser";
  return `Using ${tool}`;
}
