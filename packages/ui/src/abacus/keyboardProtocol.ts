// Enough of the kitty keyboard protocol for a program in the terminal pane to
// tell Enter from Shift, Ctrl or Alt+Enter. xterm.js sends the same carriage
// return for all of them, so a terminal app — the abacus TUI among them —
// could not start a new line on Ctrl+Enter there. A program asks for the
// protocol by pushing flags (CSI > flags u) and gives them back as it exits
// (CSI < u); while it holds them, a modified Enter reaches it as
// CSI 13 ; modifiers u. Each screen keeps its own stack, as in kitty, so a
// program that dies on the alternate screen leaves the shell's keys as they
// were. Every other key keeps xterm's own encoding, which such programs read
// too.

import type { IDisposable, Terminal } from "@xterm/xterm";

/** The flag that makes ambiguous keys, a modified Enter among them, unambiguous. */
const DISAMBIGUATE = 1;
/** Kitty's bound on a stack: the oldest entries go first. */
const MOST = 32;

type Screen = "normal" | "alternate";

/** The flags programs have asked for, per screen. */
export class KeyboardFlags {
  private readonly stacks: Record<Screen, number[]> = { normal: [], alternate: [] };

  constructor(private readonly screen: () => Screen) {}

  get current(): number {
    return this.stacks[this.screen()].at(-1) ?? 0;
  }

  push(flags: number): void {
    const stack = this.stacks[this.screen()];
    stack.push(flags);
    if (stack.length > MOST) stack.shift();
  }

  pop(count: number): void {
    const stack = this.stacks[this.screen()];
    stack.splice(Math.max(0, stack.length - Math.max(1, count)));
  }

  /** CSI = flags ; mode u: 1 replaces the current flags, 2 adds to them, 3 takes them away. */
  set(flags: number, mode: number): void {
    const stack = this.stacks[this.screen()];
    const current = stack.at(-1) ?? 0;
    const next = mode === 2 ? current | flags : mode === 3 ? current & ~flags : flags;
    if (stack.length === 0) stack.push(next);
    else stack[stack.length - 1] = next;
  }

  /** Leaving the alternate screen forgets what was asked for on it. */
  leftAlternate(): void {
    this.stacks.alternate = [];
  }
}

interface Key {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** What a key sends with `flags` asked for: a modified Enter's sequence, or null for xterm's own. */
export function enterSequence(flags: number, event: Key): string | null {
  if ((flags & DISAMBIGUATE) === 0 || event.key !== "Enter") return null;
  const modifiers =
    (event.shiftKey ? 1 : 0) |
    (event.altKey ? 2 : 0) |
    (event.ctrlKey ? 4 : 0) |
    (event.metaKey ? 8 : 0);
  return modifiers === 0 ? null : `\x1b[13;${modifiers + 1}u`;
}

/** Answer the protocol in `term`; `send` writes to the program. Returns what undoes it. */
export function speakKeyboardProtocol(term: Terminal, send: (data: string) => void): IDisposable {
  const flags = new KeyboardFlags(() => term.buffer.active.type);
  const number = (param: number | number[] | undefined, fallback: number) =>
    typeof param === "number" && param > 0 ? param : fallback;
  const handlers = [
    term.parser.registerCsiHandler({ prefix: ">", final: "u" }, (params) => {
      flags.push(number(params[0], 0));
      return true;
    }),
    term.parser.registerCsiHandler({ prefix: "<", final: "u" }, (params) => {
      flags.pop(number(params[0], 1));
      return true;
    }),
    term.parser.registerCsiHandler({ prefix: "=", final: "u" }, (params) => {
      flags.set(number(params[0], 0), number(params[1], 1));
      return true;
    }),
    // A program asking whether the terminal speaks the protocol.
    term.parser.registerCsiHandler({ prefix: "?", final: "u" }, () => {
      send(`\x1b[?${flags.current}u`);
      return true;
    }),
    term.buffer.onBufferChange((buffer) => {
      if (buffer.type === "normal") flags.leftAlternate();
    }),
  ];
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    const sequence = enterSequence(flags.current, event);
    if (sequence === null) return true;
    event.preventDefault();
    send(sequence);
    return false;
  });
  return {
    dispose: () => {
      for (const handler of handlers) handler.dispose();
      term.attachCustomKeyEventHandler(() => true);
    },
  };
}
