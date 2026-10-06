// One `abacus app-server` child process per window, spoken to in JSON-RPC 2.0
// over newline-delimited stdio.
//
// The CLI owns the protocol. Three kinds of frame cross this pipe:
//
//   * client -> server requests, which get exactly one reply keyed by `id`;
//   * server -> client notifications, which have a method and no id;
//   * server -> client *requests*, which have both. These are the points where
//     the agent is blocked on a person (an approval, a question), and the UI
//     must answer with a matching `result` frame before the turn continues.
//
// No agent logic lives in the desktop app, deliberately: upgrading the CLI
// cannot leave the window rendering a stale idea of what a turn does.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

export type RequestId = number | string;

export interface ServerFrame {
  jsonrpc?: "2.0";
  id?: RequestId | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/** What the window learns about: everything except replies to its own requests. */
export type ForwardedFrame =
  | { kind: "notification"; method: string; params: unknown }
  | { kind: "request"; id: RequestId; method: string; params: unknown };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** Lines of stderr kept for explaining a crash: enough context, bounded memory. */
const STDERR_TAIL = 200;

export class AppServerError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "AppServerError";
  }
}

export interface AppServerEvents {
  frame: [ForwardedFrame];
  log: [string];
  exit: [code: number | null, tail: string];
}

export class AppServer extends EventEmitter<AppServerEvents> {
  #child: ChildProcessWithoutNullStreams | null = null;
  readonly #pending = new Map<RequestId, Pending>();
  #nextId = 1;
  readonly #stderr: string[] = [];

  constructor(
    readonly bin: string,
    readonly workspace: string,
  ) {
    super();
  }

  get running(): boolean {
    return this.#child !== null && this.#child.exitCode === null;
  }

  start(): void {
    // The workspace is a positional argument, before the subcommand.
    const child = spawn(this.bin, [this.workspace, "app-server"], {
      cwd: this.workspace,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;

    createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    createInterface({ input: child.stderr }).on("line", (line) => {
      this.#stderr.push(line);
      if (this.#stderr.length > STDERR_TAIL) this.#stderr.shift();
      this.emit("log", line);
    });
    child.on("exit", (code) => this.#closed(code));
    child.on("error", (error) => {
      this.#stderr.push(error.message);
      this.#closed(-1);
    });
  }

  /** Parse one stdout line. Public so the framing can be tested without a process. */
  handleLine(line: string): void {
    if (!line.trim()) return;
    let frame: ServerFrame;
    try {
      frame = JSON.parse(line) as ServerFrame;
    } catch {
      // The CLI promises stdout is protocol-only; anything else is a bug worth
      // seeing in the log rather than silently dropping.
      this.emit("log", `unparsed stdout: ${line}`);
      return;
    }
    this.#dispatch(frame);
  }

  #dispatch(frame: ServerFrame): void {
    const hasId = frame.id !== undefined && frame.id !== null;
    if (hasId && !frame.method) {
      const pending = this.#pending.get(frame.id as RequestId);
      if (!pending) return;
      this.#pending.delete(frame.id as RequestId);
      if (frame.error) {
        pending.reject(
          new AppServerError(
            frame.error.message ?? "request failed",
            frame.error.code,
            frame.error.data,
          ),
        );
      } else {
        pending.resolve(frame.result);
      }
      return;
    }
    if (hasId && frame.method) {
      this.emit("frame", {
        kind: "request",
        id: frame.id as RequestId,
        method: frame.method,
        params: frame.params ?? {},
      });
      return;
    }
    if (frame.method) {
      this.emit("frame", {
        kind: "notification",
        method: frame.method,
        params: frame.params ?? {},
      });
    }
  }

  #write(frame: ServerFrame): void {
    if (!this.running || !this.#child)
      throw new AppServerError("the abacus process is not running");
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`);
  }

  request(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#write({ id, method, params });
      } catch (error) {
        this.#pending.delete(id);
        reject(error as Error);
      }
    });
  }

  /** Answer a request the agent is blocked on. */
  respond(id: RequestId, result: unknown): void {
    this.#write({ id, result });
  }

  /** Ask politely, then make sure: a hung child must never outlive its window. */
  stop(): void {
    const child = this.#child;
    if (!child) return;
    try {
      this.#write({ method: "shutdown" });
    } catch {
      // Already gone; the kill below is the backstop.
    }
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    }, 1500).unref();
  }

  #closed(code: number | null): void {
    if (!this.#child) return;
    this.#child = null;
    for (const { reject } of this.#pending.values())
      reject(new AppServerError("the abacus process exited"));
    this.#pending.clear();
    this.emit("exit", code, this.#stderr.slice(-20).join("\n"));
  }
}
