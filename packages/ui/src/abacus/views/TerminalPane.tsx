// The terminal pane: shells in the open project, one per tab, under the
// conversation. Hidden rather than unmounted when toggled off, so the shells
// and their scrollback survive; a new project starts fresh ones.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type ITheme } from "@xterm/xterm";
import { ChevronDownIcon, PlusIcon, SquareTerminalIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { TerminalEvent } from "../bridge.js";
import { useColorSchemeChoice } from "../useColorScheme.js";

const HEIGHT_KEY = "abacus.terminal.height";
const MIN_HEIGHT = 120;

interface Tab {
  key: number;
  title: string;
}

export function TerminalPane({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([{ key: 1, title: "Terminal 1" }]);
  const [active, setActive] = useState(1);
  const [height, setHeight] = useState(storedHeight);
  const counter = useRef(1);

  const add = () => {
    counter.current += 1;
    const tab = { key: counter.current, title: `Terminal ${counter.current}` };
    setTabs((current) => [...current, tab]);
    setActive(tab.key);
  };

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
        <PaneButton label="New terminal" onClick={add}>
          <PlusIcon className="size-3.5" />
        </PaneButton>
        <PaneButton label="Hide terminal (Ctrl+`)" onClick={onClose}>
          <ChevronDownIcon className="size-3.5" />
        </PaneButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <TerminalView key={tab.key} visible={open && tab.key === active} />
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
 * starts a new one in the same tab.
 */
function TerminalView({ visible }: { visible: boolean }) {
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

    const handle = (event: TerminalEvent) => {
      if (event.kind === "data") {
        term.write(event.data);
      } else {
        exited = true;
        id = null;
        term.write(
          `\r\n\x1b[2m[process exited${event.code ? ` with code ${event.code}` : ""} — press any key for a new shell]\x1b[0m\r\n`,
        );
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
        .openTerminal(term.cols, term.rows)
        .then((opened) => {
          if (disposed) return bridge.closeTerminal(opened);
          id = opened;
          for (const event of early.splice(0)) if (event.id === opened) handle(event);
        })
        .catch((error: unknown) => {
          exited = true;
          term.write(
            `\x1b[31m${error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "") : String(error)}\x1b[0m\r\n`,
          );
        });
    };

    const input = term.onData((data) => {
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
    start();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      input.dispose();
      resize.dispose();
      unsubscribe();
      if (id !== null) bridge.closeTerminal(id);
      term.dispose();
      terminal.current = null;
    };
  }, []);

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

const DARK_ANSI = {
  black: "#2a2238",
  red: "#ff8f9b",
  green: "#7ee2a8",
  yellow: "#f2c46b",
  blue: "#8ab4ff",
  magenta: "#c792ff",
  cyan: "#7fdbe0",
  white: "#d4cde0",
  brightBlack: "#6a627a",
  brightRed: "#ffb0b8",
  brightGreen: "#a6f0c6",
  brightYellow: "#f8d896",
  brightBlue: "#adc9ff",
  brightMagenta: "#dcb6ff",
  brightCyan: "#a6eef2",
  brightWhite: "#ffffff",
};

const LIGHT_ANSI = {
  black: "#17121f",
  red: "#c42b3c",
  green: "#127a46",
  yellow: "#8a5600",
  blue: "#2f5bd3",
  magenta: "#7b3fe4",
  cyan: "#0e7c86",
  white: "#8f88a0",
  brightBlack: "#625b6f",
  brightRed: "#d9485a",
  brightGreen: "#1a9a5a",
  brightYellow: "#a86b00",
  brightBlue: "#4a74e6",
  brightMagenta: "#9255f0",
  brightCyan: "#13949f",
  brightWhite: "#453e51",
};

/** The abacus palette, read from the live tokens so it matches the scheme on screen. */
function terminalTheme(): ITheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const dark = document.documentElement.classList.contains("dark");
  return {
    background: token("--color-terminal-bg"),
    foreground: token("--color-terminal-fg"),
    cursor: token("--color-brand"),
    cursorAccent: token("--color-terminal-bg"),
    selectionBackground: dark ? "rgba(182, 107, 255, 0.32)" : "rgba(123, 63, 228, 0.22)",
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
  };
}
