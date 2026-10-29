// The app servers each window runs. One is the window's own: the thread it
// shows. A thread the person leaves while it works keeps its server, parked:
// its turn goes on, its frames still reach the window (tagged with the
// server, so the window keeps them apart), and the window can switch back to
// it, or let it go once it has nothing left to do.

import type { WebContents } from "electron";
import type { ForwardedFrame } from "./appServer.js";
import { AppServer } from "./appServer.js";

export interface SessionEvents {
  frame(contents: WebContents, id: number, server: AppServer, frame: ForwardedFrame): void;
  exit(contents: WebContents, id: number, code: number | null, tail: string): void;
  log(line: string): void;
}

interface WindowServers {
  /** The server whose thread the window shows; null before one opens. */
  active: number | null;
  servers: Map<number, AppServer>;
}

export class Sessions {
  #next = 1;
  readonly #windows = new Map<number, WindowServers>();

  constructor(readonly events: SessionEvents) {}

  #window(contents: WebContents): WindowServers {
    let window = this.#windows.get(contents.id);
    if (!window) {
      window = { active: null, servers: new Map() };
      this.#windows.set(contents.id, window);
    }
    return window;
  }

  /**
   * Start a server in `workspace` and make it the window's. The one it had
   * keeps running when `keep` (its thread is still working), and stops
   * otherwise.
   */
  start(
    contents: WebContents,
    bin: string,
    workspace: string,
    keep: boolean,
    args: string[] = [],
  ): number {
    const window = this.#window(contents);
    if (!keep) this.stopActive(contents);
    const id = this.#next++;
    const server = new AppServer(bin, workspace, args);
    server.on("frame", (frame) => this.events.frame(contents, id, server, frame));
    server.on("exit", (code, tail) => {
      window.servers.delete(id);
      if (window.active === id) window.active = null;
      this.events.exit(contents, id, code, tail);
    });
    server.on("log", (line) => this.events.log(line));
    server.start();
    window.servers.set(id, server);
    window.active = id;
    return id;
  }

  /** Show a parked server's thread again; the one shown until now is parked when `keep`. */
  activate(contents: WebContents, id: number, keep: boolean): AppServer {
    const window = this.#window(contents);
    const server = window.servers.get(id);
    if (!server?.running) throw new Error("that thread's abacus has stopped; open it again");
    if (window.active !== id && !keep) this.stopActive(contents);
    window.active = id;
    return server;
  }

  /** A server of this window: `id`'s, or the one it shows. */
  get(contents: WebContents, id?: number): AppServer {
    const window = this.#windows.get(contents.id);
    const server = window ? window.servers.get(id ?? window.active ?? -1) : undefined;
    if (!server?.running) throw new Error("no workspace is open in this window");
    return server;
  }

  /** The workspace of the thread the window shows. */
  activeWorkspace(contents: WebContents): string | null {
    const window = this.#windows.get(contents.id);
    return window?.servers.get(window.active ?? -1)?.workspace ?? null;
  }

  /** Let a server go: a parked one whose thread finished, or the window's own. */
  stop(contents: WebContents, id: number): void {
    const window = this.#windows.get(contents.id);
    const server = window?.servers.get(id);
    if (!window || !server) return;
    window.servers.delete(id);
    if (window.active === id) window.active = null;
    server.removeAllListeners();
    server.stop();
  }

  stopActive(contents: WebContents): void {
    const active = this.#windows.get(contents.id)?.active;
    if (active !== null && active !== undefined) this.stop(contents, active);
  }

  /** Every server of a window that closed. */
  closeWindow(windowId: number): void {
    const window = this.#windows.get(windowId);
    if (!window) return;
    this.#windows.delete(windowId);
    for (const server of window.servers.values()) {
      server.removeAllListeners();
      server.stop();
    }
  }

  stopAll(): void {
    for (const id of this.#windows.keys()) this.closeWindow(id);
  }
}
