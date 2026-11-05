// The terminal pane: shells in the open project, one per tab, under the
// conversation. Hidden rather than unmounted when toggled off, so the shells
// and their scrollback survive; a new project starts fresh ones. A command run
// from the conversation goes to the open tab when its shell is at the prompt,
// and to a new tab otherwise.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { ChevronDownIcon, PlusIcon, SquareTerminalIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { TerminalEvent } from "../bridge.js";
import { commandTitle, typedCommand, type RunRequest } from "../runCommand.js";
import { useColorSchemeChoice } from "../useColorScheme.js";
import { terminalTheme } from "./terminalTheme.js";

const HEIGHT_KEY = "abacus.terminal.height";
const MIN_HEIGHT = 120;

interface Tab {
  key: number;
  title: string;
  /** What the tab was opened to run, typed once its shell is up. */
  command?: string;
}

/** A tab's shell, as Run reaches it. */
interface Shell {
  idle(): Promise<boolean>;
  /** Type `command` and Enter; false when there is no shell to take it. */
  run(command: string): boolean;
}

export function TerminalPane({
  open,
  onClose,
  runRequest = null,
}: {
  open: boolean;
  onClose: () => void;
  runRequest?: RunRequest | null;
}) {
  // A pane opened to run something runs it in its first tab.
  const [tabs, setTabs] = useState<Tab[]>(() => [
    runRequest
      ? { key: 1, title: commandTitle(runRequest.command), command: runRequest.command }
      : { key: 1, title: "Terminal 1" },
  ]);
  const [active, setActive] = useState(1);
  const [height, setHeight] = useState(storedHeight);
  const counter = useRef(1);
  const shells = useRef(new Map<number, Shell>());
  const handled = useRef(runRequest?.seq ?? 0);
  const activeRef = useRef(active);
  activeRef.current = active;

  const add = (command?: string) => {
    counter.current += 1;
    const tab = command
      ? { key: counter.current, title: commandTitle(command), command }
      : { key: counter.current, title: `Terminal ${counter.current}` };
    setTabs((current) => [...current, tab]);
    setActive(tab.key);
  };
  const addRef = useRef(add);
  addRef.current = add;

  useEffect(() => {
    if (!runRequest || runRequest.seq === handled.current) return;
    handled.current = runRequest.seq;
    const shell = shells.current.get(activeRef.current);
    void (shell?.idle() ?? Promise.resolve(false)).then((idle) => {
      if (!(idle && shell?.run(runRequest.command))) addRef.current(runRequest.command);
    });
  }, [runRequest]);

  const remove = (key: number) => {
    const rest = tabs.filter((tab) => tab.key !== key);
    if (rest.length === 0) {
      // Closing the last tab closes the pane; reopening starts a fresh shell.
      counter.current += 1;
      setTabs([{ key: counter.current, title: `Terminal ${counter.current}` }]);
      setActive(counter.current);
      onClose();
      return;
    }
    setTabs(rest);
    if (active === key) setActive(rest[rest.length - 1]!.key);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startY = event.clientY;
    const startHeight = height;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent) => {
      const max = Math.round(window.innerHeight * 0.75);
      setHeight(Math.min(max, Math.max(MIN_HEIGHT, startHeight + startY - moved.clientY)));
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      setHeight((final) => {
        try {
          localStorage.setItem(HEIGHT_KEY, String(final));
        } catch {
          // Storage off: the height holds for this window.
        }
        return final;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
  };

  return (
    <section
      className={cn("relative flex shrink-0 flex-col border-t bg-terminal-bg", !open && "hidden")}
      style={{ height }}
      aria-label="Terminal"
    >
      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
      />
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide"
          role="tablist"
        >
          {tabs.map((tab) => (
            <div
              key={tab.key}
              role="tab"
              aria-selected={tab.key === active}
              onClick={() => setActive(tab.key)}
              className={cn(
                "group/tab flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-1 pl-2 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground",
                tab.key === active && "bg-hover text-foreground",
              )}
            >
              <SquareTerminalIcon className="size-3.5 text-foreground-subtlest" />
              <span>{tab.title}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  remove(tab.key);
                }}
                className="rounded p-0.5 text-foreground-subtlest opacity-0 group-hover/tab:opacity-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100"
                aria-label={`Close ${tab.title}`}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <PaneButton label="New terminal" onClick={() => add()}>
          <PlusIcon className="size-3.5" />
        </PaneButton>
        <PaneButton label="Hide terminal (Ctrl+`)" onClick={onClose}>
          <ChevronDownIcon className="size-3.5" />
        </PaneButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <TerminalView
            key={tab.key}
            visible={open && tab.key === active}
            command={tab.command}
            onShell={(shell) => {
              if (shell) shells.current.set(tab.key, shell);
              else shells.current.delete(tab.key);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function PaneButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One shell. Its xterm lives as long as the tab; when the shell exits, any key
 * starts a new one in the same tab. With `run`, it runs that command once
 * instead (`abacus update`), and tells `onExit` how it ended. `command` is
 * typed once the shell first shows its prompt; `onShell` lets Run reach it.
 */
export function TerminalView({
  visible,
  run,
  onExit,
  command,
  onShell,
}: {
  visible: boolean;
  run?: "update";
  onExit?: (code: number | null) => void;
  command?: string;
  onShell?: (shell: Shell | null) => void;
}) {
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const commandRef = useRef(command);
  const shellRef = useRef(onShell);
  shellRef.current = onShell;
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const scheme = useColorSchemeChoice();

  useEffect(() => {
    const bridge = window.abacus;
    const element = host.current;
    if (!bridge || !element) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      macOptionIsMeta: true,
      allowProposedApi: false,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_event, uri) => void bridge.openExternal(uri)));
    term.open(element);
    terminal.current = { term, fit };
    safeFit(fit);

    let id: number | null = null;
    let exited = false;
    let disposed = false;
    // Output can beat the id back from the main process; hold it until then.
    const early: TerminalEvent[] = [];
    let waiting = commandRef.current;
    let typing = 0;

    const type = (text: string) => {
      if (id === null || exited) return false;
      bridge.writeTerminal(id, typedCommand(text, term.modes.bracketedPasteMode));
      term.focus();
      return true;
    };
    shellRef.current?.({
      idle: async () => id !== null && !exited && (await bridge.terminalIdle(id)),
      run: type,
    });

    const handle = (event: TerminalEvent) => {
      if (event.kind === "data") {
        term.write(event.data);
        // The first output is the prompt coming up; a moment later the
        // shell reads what is typed, and has said whether it takes pastes.
        if (waiting !== undefined) {
          const text = waiting;
          waiting = undefined;
          typing = window.setTimeout(() => type(text), 150);
        }
      } else {
        exited = true;
        id = null;
        const code = event.code ? ` with code ${event.code}` : "";
        term.write(
          run
            ? `\r\n\x1b[2m[finished${code}]\x1b[0m\r\n`
            : `\r\n\x1b[2m[process exited${code} — press any key for a new shell]\x1b[0m\r\n`,
        );
        exitRef.current?.(event.code);
      }
    };
    const unsubscribe = bridge.onTerminal((event) => {
      if (id === null) {
        if (!exited) early.push(event);
        return;
      }
      if (event.id === id) handle(event);
    });

    const start = () => {
      exited = false;
      early.length = 0;
      bridge
        .openTerminal(term.cols, term.rows, run)
        .then((opened) => {
          if (disposed) return bridge.closeTerminal(opened);
          id = opened;
          for (const event of early.splice(0)) if (event.id === opened) handle(event);
        })
        .catch((error: unknown) => {
          exited = true;
          if (run) exitRef.current?.(null);
          term.write(
            `\x1b[31m${error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "") : String(error)}\x1b[0m\r\n`,
          );
        });
    };

    const input = term.onData((data) => {
      if (exited && run) return;
      if (exited) {
        term.clear();
        start();
        return;
      }
      if (id !== null) bridge.writeTerminal(id, data);
    });
    const resize = term.onResize(({ cols, rows }) => {
      if (id !== null) bridge.resizeTerminal(id, cols, rows);
    });

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => safeFit(fit));
    });
    observer.observe(element);
    // A tick later: React's development mode mounts every effect twice, and
    // the first mount's start is cancelled rather than run and closed. For
    // `abacus update` that is the difference between one installer and two.
    const starting = setTimeout(start);

    return () => {
      disposed = true;
      clearTimeout(starting);
      clearTimeout(typing);
      shellRef.current?.(null);
      observer.disconnect();
      cancelAnimationFrame(frame);
      input.dispose();
      resize.dispose();
      unsubscribe();
      // An update goes on to the end when its view closes: an installer
      // stopped halfway is worse than one nobody watches.
      if (id !== null && !run) bridge.closeTerminal(id);
      term.dispose();
      terminal.current = null;
    };
  }, [run]);

  // A tab coming into view fits its space and takes the keyboard.
  useEffect(() => {
    if (!visible || !terminal.current) return;
    const { term, fit } = terminal.current;
    requestAnimationFrame(() => {
      safeFit(fit);
      term.focus();
    });
  }, [visible]);

  // The palette follows the app's light or dark scheme. A frame later: the
  // root applies the scheme's class after this effect runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (terminal.current) terminal.current.term.options.theme = terminalTheme();
    });
    return () => cancelAnimationFrame(frame);
  }, [scheme]);

  return (
    <div ref={host} className={cn("absolute inset-0 pt-1 pb-1 pl-3", !visible && "invisible")} />
  );
}

function safeFit(fit: FitAddon) {
  try {
    fit.fit();
  } catch {
    // Not laid out yet (hidden); the next resize fits it.
  }
}

function storedHeight(): number {
  try {
    const value = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(value) && value >= MIN_HEIGHT ? value : 280;
  } catch {
    return 280;
  }
}
