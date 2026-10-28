// Terminals for the window's terminal pane: a shell in a pseudo-terminal per
// tab, started in the open project. Each belongs to the window that opened
// it and dies with that window or when it leaves the project.
//
// Output is coalesced before it crosses IPC: a build log can print thousands
// of lines a second, and one message per chunk would swamp the renderer.

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { IPty } from "@lydell/node-pty";

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

interface Session {
  owner: number;
  pty: IPty;
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
    const session: Session = { owner, pty, pending: "", timer: null };
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
