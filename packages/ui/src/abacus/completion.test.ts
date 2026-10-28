import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  commandCompletion,
  fileSuggestions,
  mentionAt,
  mergeCommands,
  parseCommand,
  type CommandEntry,
} from "./completion.js";

const server: CommandEntry[] = [
  { name: "btw", description: "Note something", kind: "builtin" },
  { name: "compact", description: "Compact", kind: "builtin" },
  { name: "review", description: "Review code", kind: "skill" },
];
const commands = mergeCommands(server);
const options = (name: string) => (name === "mode" ? ["auto", "yolo"] : undefined);

describe("commands", () => {
  it("lists the window's commands first and the server's once each", () => {
    const names = commands.map((command) => command.name);
    expect(names.filter((name) => name === "compact")).toHaveLength(1);
    expect(names.indexOf("new")).toBeLessThan(names.indexOf("review"));
    expect(commands.find((command) => command.name === "review")?.takesArgument).toBe(true);
    expect(commands.find((command) => command.name === "btw")?.takesArgument).toBe(true);
  });

  it("offers /profile and no longer /plan or /model", () => {
    const names = commands.map((command) => command.name);
    expect(names).toContain("profile");
    expect(names).not.toContain("plan");
    expect(names).not.toContain("model");
  });

  it("parses what a draft asks for", () => {
    expect(parseCommand("/mode yolo")).toEqual({ name: "mode", argument: "yolo" });
    expect(parseCommand("  /New  ")).toEqual({ name: "new", argument: "" });
    expect(parseCommand("/review the parser\nand tests")).toEqual({
      name: "review",
      argument: "the parser\nand tests",
    });
    expect(parseCommand("/usr/bin is a path")).toBeNull();
    expect(parseCommand("hello /mode")).toBeNull();
  });

  it("completes a command name by prefix, then by substring", () => {
    const state = commandCompletion("/re", 3, commands, options)!;
    expect(state.kind).toBe("command");
    expect(state.suggestions.map((item) => item.label).slice(0, 3)).toEqual([
      "/rename",
      "/repair",
      "/review",
    ]);
    const review = state.suggestions.find((item) => item.label === "/review")!;
    expect(review).toMatchObject({ insert: "/review ", badge: "skill", run: false });
    const settings = commandCompletion("/set", 4, commands, options)!.suggestions[0]!;
    expect(settings).toMatchObject({ label: "/settings", run: true });
  });

  it("completes an argument from a fixed set once the name is typed", () => {
    const state = commandCompletion("/mode yo", 8, commands, options)!;
    expect(state.kind).toBe("argument");
    expect(state.suggestions.map((item) => item.label)).toEqual(["yolo"]);
    expect(applySuggestion("/mode yo", state.suggestions[0]!)).toEqual({
      text: "/mode yolo",
      caret: 10,
    });
    expect(commandCompletion("/review the", 11, commands, options)).toBeNull();
    expect(commandCompletion("not a command", 3, commands, options)).toBeNull();
  });
});

describe("file mentions", () => {
  it("finds the @token at the caret", () => {
    expect(mentionAt("look at @src/ma", 15)).toEqual({ from: 8, query: "src/ma" });
    expect(mentionAt("@", 1)).toEqual({ from: 0, query: "" });
    expect(mentionAt("mail me@example.com", 19)).toBeNull();
    expect(mentionAt("look at @src now", 16)).toBeNull();
  });

  it("replaces the token with the chosen path", () => {
    const draft = "look at @ma please";
    const mention = mentionAt(draft, 11)!;
    const [first] = fileSuggestions(["src/main.rs"], mention, 11);
    expect(first).toMatchObject({ label: "main.rs", detail: "src" });
    expect(applySuggestion(draft, first!)).toEqual({
      text: "look at @src/main.rs please",
      caret: 21,
    });
    expect(
      applySuggestion("@ma", fileSuggestions(["main.rs"], mentionAt("@ma", 3)!, 3)[0]!),
    ).toEqual({
      text: "@main.rs ",
      caret: 9,
    });
  });
});
