// Terminals for the window's terminal pane: a shell in a pseudo-terminal per
// tab, started in the open project. Each belongs to the window that opened
// it and dies with that window or when it leaves the project.
//
// Output is coalesced before it crosses IPC: a build log can print thousands
// of lines a second, and one message per chunk would swamp the renderer.

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import type { IPty } from "@lydell/node-pty";
import { ipcMain, type IpcMainEvent } from "electron";

export type TerminalEvent =
  | { kind: "data"; id: number; data: string }
  | { kind: "exit"; id: number; code: number | null };

type Spawn = typeof import("@lydell/node-pty").spawn;

const FLUSH_MS = 8;
const FLUSH_BYTES = 64 * 1024;

/** The shell to start, and its arguments: the person's own login shell where there is one. */
export function defaultShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): { file: string; args: string[] } {
  if (platform === "win32") {
    return { file: env.ABACUS_SHELL || "powershell.exe", args: ["-NoLogo"] };
  }
  const file = env.ABACUS_SHELL || env.SHELL || (existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash");
  // A login shell reads the profile, so PATH matches a terminal opened by hand.
  return { file, args: platform === "darwin" ? ["-l"] : [] };
}

/**
 * Whether a terminal's shell is waiting at its prompt: what has the terminal
 * (`foreground`, as node-pty names it) is the shell it started. Windows names
 * the shell whatever runs in it, so there a terminal is never known to be free.
 */
export function atPrompt(
  foreground: string,
  shell: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === "win32") return false;
  // A login shell's name starts with a dash.
  const name = (file: string) => basename(file.trim()).replace(/^-/, "");
  return name(foreground) !== "" && name(foreground) === name(shell);
}

interface Session {
  owner: number;
  pty: IPty;
  /** What was started in it: the shell, or the one command. */
  file: string;
  pending: string;
  timer: NodeJS.Timeout | null;
}

export class Terminals extends EventEmitter<{ event: [owner: number, event: TerminalEvent] }> {
  readonly #sessions = new Map<number, Session>();
  #nextId = 1;

  constructor(private readonly spawn: Spawn) {
    super();
  }

  /** A shell, or `command` in its place (`abacus update`, which may ask for a password). */
  open(
    owner: number,
    cwd: string,
    cols: number,
    rows: number,
    command: { file: string; args: string[] } = defaultShell(),
  ): number {
    const { file, args } = command;
    const pty = this.spawn(file, args, {
      name: "xterm-256color",
      cols: clamp(cols, 2, 1000),
      rows: clamp(rows, 1, 500),
      cwd: existsSync(cwd) ? cwd : homedir(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "abacus",
      } as Record<string, string>,
    });
    const id = this.#nextId++;
    const session: Session = { owner, pty, file, pending: "", timer: null };
    this.#sessions.set(id, session);

    pty.onData((data) => {
      session.pending += data;
      if (session.pending.length >= FLUSH_BYTES) this.#flush(id);
      else session.timer ??= setTimeout(() => this.#flush(id), FLUSH_MS);
    });
    pty.onExit(({ exitCode }) => {
      this.#flush(id);
      this.#sessions.delete(id);
      this.emit("event", owner, { kind: "exit", id, code: exitCode });
    });
    return id;
  }

  write(owner: number, id: number, data: string): void {
    this.#own(owner, id)?.pty.write(data);
  }

  /** Whether the shell in this terminal is at its prompt, free to take a command. */
  idle(owner: number, id: number): boolean {
    const session = this.#own(owner, id);
    return session !== undefined && atPrompt(session.pty.process, session.file);
  }

  resize(owner: number, id: number, cols: number, rows: number): void {
    const session = this.#own(owner, id);
    if (!session) return;
    try {
      session.pty.resize(clamp(cols, 2, 1000), clamp(rows, 1, 500));
    } catch {
      // The process exited between the layout change and the resize.
    }
  }

  close(owner: number, id: number): void {
    this.#own(owner, id)?.pty.kill();
  }

  /** Every terminal a window opened: it closed, or left its project. */
  closeAll(owner: number): void {
    for (const [id, session] of this.#sessions) {
      if (session.owner === owner) {
        session.pty.kill();
        this.#sessions.delete(id);
      }
    }
  }

  #own(owner: number, id: number): Session | undefined {
    const session = this.#sessions.get(id);
    // A window only ever reaches its own terminals.
    return session?.owner === owner ? session : undefined;
  }

  #flush(id: number): void {
    const session = this.#sessions.get(id);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    if (!session.pending) return;
    const data = session.pending;
    session.pending = "";
    this.emit("event", session.owner, { kind: "data", id, data });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
}

/**
 * Answer a window about its terminals: keystrokes, resizes and closing, which
 * are one-way and nothing waits on, and whether a shell is at its prompt.
 * `host` is null until the window opens its first terminal.
 */
export function answerTerminalRequests(host: () => Promise<Terminals> | null): void {
  const onTerminal =
    (handle: (terminals: Terminals, event: IpcMainEvent, id: number, ...rest: unknown[]) => void) =>
    (event: IpcMainEvent, id: unknown, ...rest: unknown[]) => {
      if (typeof id !== "number") return;
      void host()
        ?.then((terminals) => handle(terminals, event, id, ...rest))
        .catch(() => {});
    };
  ipcMain.on(
    "terminal:write",
    onTerminal((terminals, event, id, data) => {
      if (typeof data === "string") terminals.write(event.sender.id, id, data);
    }),
  );
  ipcMain.on(
    "terminal:resize",
    onTerminal((terminals, event, id, cols, rows) =>
      terminals.resize(event.sender.id, id, Number(cols), Number(rows)),
    ),
  );
  ipcMain.on(
    "terminal:close",
    onTerminal((terminals, event, id) => terminals.close(event.sender.id, id)),
  );
  // Whether Run may type into a tab: its shell is at the prompt.
  ipcMain.handle("terminal:idle", async (event, id: unknown) =>
    typeof id === "number" ? Boolean((await host())?.idle(event.sender.id, id)) : false,
  );
}
