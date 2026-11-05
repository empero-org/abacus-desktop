// Running a command the agent wrote. A fenced block tagged with a shell gets a
// Run button, and Run types the command into the terminal pane: into the open
// tab when its shell is at the prompt, a new tab otherwise, so its output
// shows there. Abacus is told to write commands for the person that way.

import { createContext, useContext } from "react";

/** The languages a block runs in a shell for. */
const SHELLS = new Set(["bash", "sh", "shell", "zsh", "fish", "powershell", "pwsh", "ps1"]);

/** Whether a block in `language` gets a Run button. */
export function runnable(language: string): boolean {
  return SHELLS.has(language.toLowerCase());
}

/**
 * What goes to the shell for `command`: the whole of it as one paste, in
 * brackets when the shell asked for those so its lines stay one command line,
 * then Enter. It carries no escape character of its own, so nothing in it can
 * close the paste early.
 */
export function typedCommand(command: string, bracketed: boolean): string {
  // oxlint-disable-next-line no-control-regex -- removing ESC is the point.
  const text = command.replace(/\x1b/g, "").trimEnd().replace(/\r?\n/g, "\r");
  return `${bracketed ? `\x1b[200~${text}\x1b[201~` : text}\r`;
}

/** A command to run; `seq` tells one request from the next, the same command included. */
export interface RunRequest {
  command: string;
  seq: number;
}

/** A tab's name for the command it was opened to run: its first line, short. */
export function commandTitle(command: string): string {
  const line = command.trim().split("\n")[0]!.trim();
  return line.length > 28 ? `${line.slice(0, 27)}…` : line;
}

/** Run a command in the terminal pane; null where there is none to run it in. */
export const RunCommand = createContext<((command: string) => void) | null>(null);

export function useRunCommand(): ((command: string) => void) | null {
  return useContext(RunCommand);
}
