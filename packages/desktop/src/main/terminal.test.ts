import { describe, expect, it, vi } from "vitest";
import { defaultShell, Terminals, type TerminalEvent } from "./terminal.js";

/** A pty that records what it is told and emits what the test says. */
function fakePty() {
  let onData: (data: string) => void = () => {};
  let onExit: (event: { exitCode: number }) => void = () => {};
  const pty = {
    written: [] as string[],
    size: [0, 0] as [number, number],
    killed: false,
    write: (data: string) => pty.written.push(data),
    resize: (cols: number, rows: number) => (pty.size = [cols, rows]),
    kill: () => {
      pty.killed = true;
    },
    onData: (listener: typeof onData) => (onData = listener),
    onExit: (listener: typeof onExit) => (onExit = listener),
    emit: (data: string) => onData(data),
    exit: (exitCode: number) => onExit({ exitCode }),
  };
  return pty;
}

function host() {
  const ptys: ReturnType<typeof fakePty>[] = [];
  const spawn = vi.fn((_file: string, _args: string[], options: { cols: number; rows: number }) => {
    const pty = fakePty();
    pty.size = [options.cols, options.rows];
    ptys.push(pty);
    return pty;
  });
  const terminals = new Terminals(spawn as never);
  const events: [number, TerminalEvent][] = [];
  terminals.on("event", (owner, event) => events.push([owner, event]));
  return { terminals, spawn, ptys, events };
}

describe("Terminals", () => {
  it("batches output and reports the exit to the window that opened it", async () => {
    const { terminals, ptys, events } = host();
    const id = terminals.open(7, "/", 80, 24);
    ptys[0]!.emit("hel");
    ptys[0]!.emit("lo\r\n");
    expect(events).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toEqual([[7, { kind: "data", id, data: "hello\r\n" }]]);

    ptys[0]!.emit("bye");
    ptys[0]!.exit(2);
    expect(events.slice(1)).toEqual([
      [7, { kind: "data", id, data: "bye" }],
      [7, { kind: "exit", id, code: 2 }],
    ]);
  });

  it("lets a window reach only its own terminals", () => {
    const { terminals, ptys } = host();
    const mine = terminals.open(1, "/", 80, 24);
    terminals.open(2, "/", 80, 24);
    terminals.write(2, mine, "rm -rf ~\r");
    terminals.resize(2, mine, 10, 10);
    terminals.close(2, mine);
    expect(ptys[0]).toMatchObject({ written: [], size: [80, 24], killed: false });
    terminals.write(1, mine, "ls\r");
    terminals.resize(1, mine, 120, 0);
    expect(ptys[0]).toMatchObject({ written: ["ls\r"], size: [120, 1] });
  });

  it("closes every terminal of a window and leaves the others", () => {
    const { terminals, ptys } = host();
    terminals.open(1, "/", 80, 24);
    terminals.open(1, "/", 80, 24);
    terminals.open(2, "/", 80, 24);
    terminals.closeAll(1);
    expect(ptys.map((pty) => pty.killed)).toEqual([true, true, false]);
  });
});

describe("defaultShell", () => {
  it("uses the person's shell, as a login shell on macOS", () => {
    expect(defaultShell("linux", { SHELL: "/usr/bin/fish" })).toEqual({
      file: "/usr/bin/fish",
      args: [],
    });
    expect(defaultShell("darwin", { SHELL: "/bin/zsh" })).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
    });
    expect(defaultShell("win32", {})).toEqual({ file: "powershell.exe", args: ["-NoLogo"] });
    expect(defaultShell("linux", { SHELL: "/bin/bash", ABACUS_SHELL: "/bin/dash" }).file).toBe(
      "/bin/dash",
    );
  });
});
