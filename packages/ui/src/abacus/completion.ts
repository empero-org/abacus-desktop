// What the composer offers while the person types: commands after a leading
// `/`, their arguments after `/name `, and workspace files after `@`. Pure
// functions over the draft and the caret, so they can be tested without a DOM.

export interface CommandEntry {
  name: string;
  description: string;
  /** builtin: handled by this window or the app server; skill and plugin: expand to a prompt. */
  kind: "builtin" | "skill" | "plugin";
  /** Whether the command wants text after it (`/mode yolo`, `/btw …`). */
  takesArgument?: boolean;
}

/** Commands this window carries out itself, without starting a turn. */
export const WINDOW_COMMANDS: CommandEntry[] = [
  { name: "new", description: "Start a new thread", kind: "builtin" },
  {
    name: "mode",
    description: "Auto reviews risky actions; YOLO runs everything",
    kind: "builtin",
    takesArgument: true,
  },
  { name: "profile", description: "Switch the profile", kind: "builtin", takesArgument: true },
  { name: "effort", description: "Set the reasoning effort", kind: "builtin", takesArgument: true },
  { name: "compact", description: "Compact the conversation's context", kind: "builtin" },
  { name: "rename", description: "Rename this thread", kind: "builtin", takesArgument: true },
  {
    name: "theme",
    description: "Switch dark, light or system theme",
    kind: "builtin",
    takesArgument: true,
  },
  { name: "settings", description: "Open settings", kind: "builtin" },
];

/** Commands the app server knows but the window passes through as text. */
const SERVER_ARGUMENTS = new Set(["btw"]);

export const MODE_OPTIONS = ["auto", "yolo"];
export const EFFORT_OPTIONS = ["auto", "minimal", "low", "medium", "high", "xhigh", "max"];
export const THEME_OPTIONS = ["dark", "light", "system"];

/** The window's commands followed by the server's (skills, plugins, `/btw`), each name once. */
export function mergeCommands(server: CommandEntry[]): CommandEntry[] {
  const seen = new Set(WINDOW_COMMANDS.map((command) => command.name));
  const extra = server
    .filter((command) => !seen.has(command.name))
    .map((command) => ({
      ...command,
      // A skill can take a request after its name; `/btw` needs one.
      takesArgument: command.kind !== "builtin" || SERVER_ARGUMENTS.has(command.name),
    }));
  return [...WINDOW_COMMANDS, ...extra];
}

/** The `/name argument` a draft is, or null when it does not start with a command. */
export function parseCommand(text: string): { name: string; argument: string } | null {
  const match = /^\/([A-Za-z0-9][\w:.-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  return { name: match[1]!.toLowerCase(), argument: (match[2] ?? "").trim() };
}

export interface Suggestion {
  /** What the list shows. */
  label: string;
  detail?: string;
  badge?: string;
  /** The text that replaces [from, to) of the draft. */
  insert: string;
  from: number;
  to: number;
  /** Run as soon as it is chosen: a command with nothing left to type. */
  run?: boolean;
}

export interface CompletionState {
  kind: "command" | "argument" | "file";
  /** For files: the text after `@` to search for. */
  query: string;
  suggestions: Suggestion[];
}

/**
 * Commands and their arguments. A command completes while the caret is still
 * in its name; an argument from a fixed set (mode, effort, theme, profile)
 * completes after the space.
 */
export function commandCompletion(
  draft: string,
  caret: number,
  commands: CommandEntry[],
  options: (name: string) => string[] | undefined,
): CompletionState | null {
  if (!draft.startsWith("/")) return null;
  const head = draft.slice(0, caret);
  const space = head.search(/\s/);
  if (space === -1) {
    const typed = head.slice(1).toLowerCase();
    const matches = commands
      .filter((command) => command.name.toLowerCase().startsWith(typed))
      .concat(
        commands.filter(
          (command) =>
            !command.name.toLowerCase().startsWith(typed) &&
            command.name.toLowerCase().includes(typed),
        ),
      );
    const end = draft.search(/\s/) === -1 ? draft.length : draft.search(/\s/);
    return {
      kind: "command",
      query: typed,
      suggestions: matches.map((command) => ({
        label: `/${command.name}`,
        detail: command.description,
        badge: command.kind === "builtin" ? undefined : command.kind,
        insert: command.takesArgument ? `/${command.name} ` : `/${command.name}`,
        from: 0,
        to: end,
        run: !command.takesArgument,
      })),
    };
  }
  const name = head.slice(1, space).toLowerCase();
  const choices = options(name);
  if (!choices) return null;
  const rest = head.slice(space).replace(/^\s+/, "");
  if (/\s/.test(rest)) return null;
  const from = caret - rest.length;
  const typed = rest.toLowerCase();
  return {
    kind: "argument",
    query: typed,
    suggestions: choices
      .filter((choice) => choice.toLowerCase().includes(typed))
      .sort(
        (left, right) =>
          Number(!left.toLowerCase().startsWith(typed)) -
          Number(!right.toLowerCase().startsWith(typed)),
      )
      .map((choice) => ({ label: choice, insert: choice, from, to: draft.length, run: true })),
  };
}

/** The `@partial` token the caret sits at the end of, if any. */
export function mentionAt(draft: string, caret: number): { from: number; query: string } | null {
  const head = draft.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(head);
  if (!match) return null;
  return { from: caret - match[2]!.length - 1, query: match[2]! };
}

/** File suggestions for a mention: each replaces the token with `@path `. */
export function fileSuggestions(
  files: string[],
  mention: { from: number; query: string },
  caret: number,
): Suggestion[] {
  return files.map((path) => {
    const slash = path.lastIndexOf("/");
    return {
      label: path.slice(slash + 1),
      detail: slash > 0 ? path.slice(0, slash) : undefined,
      insert: `@${path} `,
      from: mention.from,
      to: caret,
    };
  });
}

/** The draft with a suggestion applied, and where the caret goes. */
export function applySuggestion(
  draft: string,
  suggestion: Suggestion,
): { text: string; caret: number } {
  const after = draft.slice(suggestion.to);
  // A trailing space is only added where the text does not already have one.
  const insert =
    suggestion.insert.endsWith(" ") && /^\s/.test(after)
      ? suggestion.insert.slice(0, -1)
      : suggestion.insert;
  const text = draft.slice(0, suggestion.from) + insert + after;
  return { text, caret: suggestion.from + suggestion.insert.length };
}
