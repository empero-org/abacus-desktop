// The browser pane: tabs, an address bar, and the page, which is a native view
// the main process lays over the area this component reserves for it. The
// agent drives the same browser through its browser tools, and the pane says
// so while it does.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelRightIcon,
  PlusIcon,
  RotateCwIcon,
  SquareArrowOutUpRightIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.js";
import type { BrowserState } from "../bridge.js";
import { useColorScheme } from "../useColorScheme.js";
import { BrandMark } from "./BrandMark.js";

/** The pane's width while it is not expanded, kept for the next launch. */
const WIDTH_KEY = "abacus.browserWidth";
const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 320;
/** What the pane leaves the conversation, however wide it is dragged. */
const CONVERSATION_MIN = 360;

function savedWidth(): number {
  try {
    const width = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(width) && width >= MIN_WIDTH ? width : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

const EMPTY: BrowserState = { tabs: [], active: null, agent: false };

export function BrowserPane({
  expanded,
  covered,
  onExpandedChange,
  onClose,
  width,
  onWidthChange,
  popped = false,
}: {
  expanded: boolean;
  /** Something of the window's sits over the pane (a panel, a dialog): the page steps aside. */
  covered: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  /** The pane's width while not expanded, which dragging its edge changes. */
  width?: number;
  onWidthChange?: (width: number) => void;
  /** This is a window of the browser's own (popped out), not the app's pane. */
  popped?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const browser = window.abacus?.browser;
  const [state, setState] = useState<BrowserState>(EMPTY);
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const active = state.tabs.find((tab) => tab.id === state.active) ?? null;

  useEffect(() => {
    if (!browser) return;
    void browser.state().then(setState);
    return browser.onState(setState);
  }, [browser]);

  // A window of its own is named after the page it shows.
  useEffect(() => {
    if (popped) document.title = active?.title ? `${active.title} — Abacus` : "Browser — Abacus";
  }, [popped, active?.title]);

  // The address bar follows the page, except while the person is typing in it.
  useEffect(() => {
    if (!editing) setAddress(active?.url && active.url !== "about:blank" ? active.url : "");
  }, [active?.url, active?.id, editing]);

  // Keep the native page over the reserved area, and out of the way when hidden.
  useLayoutEffect(() => {
    const element = page.current;
    if (!browser || !element) return;
    const place = () => {
      const rect = element.getBoundingClientRect();
      browser.setBounds(
        covered || dragging || rect.width < 1 || rect.height < 1
          ? null
          : { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      );
    };
    place();
    // The page moves without resizing when a pane beside it opens or closes,
    // which resizes the panes beside it: watch them too.
    const observer = new ResizeObserver(place);
    observer.observe(element);
    for (const pane of element.closest("aside")?.parentElement?.children ?? []) {
      observer.observe(pane);
    }
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      browser.setBounds(null);
    };
  }, [browser, covered, dragging, active?.id, expanded, state.poppedOut]);

  if (!browser) return null;

  // Popped out, the app's pane only says where the browser went.
  if (state.poppedOut && !popped) {
    return (
      <aside
        className="flex w-72 shrink-0 flex-col items-center justify-center gap-3 border-l bg-panel px-6 text-center"
        aria-label="Browser"
      >
        <SquareArrowOutUpRightIcon className="size-5 text-foreground-subtle" />
        <p className="text-ui-sm text-foreground-subtle">The browser is in a window of its own.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void browser.popOut()}>
            Show it
          </Button>
          <Button variant="outline" size="sm" onClick={() => void browser.dock()}>
            Bring it back
          </Button>
        </div>
      </aside>
    );
  }

  // Drag the pane's edge to size it. The page is a native view that would
  // swallow the pointer, so it steps aside until the drag ends.
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pane = event.currentTarget.parentElement;
    const row = pane?.parentElement;
    if (!pane || !row || !onWidthChange) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    const right = pane.getBoundingClientRect().right;
    const most = Math.max(MIN_WIDTH, row.getBoundingClientRect().width - CONVERSATION_MIN);
    const handle = event.currentTarget;
    const move = (moved: PointerEvent) =>
      onWidthChange(Math.round(Math.min(most, Math.max(MIN_WIDTH, right - moved.clientX))));
    const done = () => {
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", done);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
  };

  const go = (input: string) => {
    if (!input.trim()) return;
    if (active) browser.navigate(active.id, input);
    else void browser.open(input);
    setEditing(false);
  };

  const detect = async () => {
    const url = await browser.detectDevServer();
    if (url) void browser.open(url);
    else setAddress("No dev server found on the usual ports");
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col bg-panel",
        popped
          ? "min-w-0 flex-1"
          : expanded
            ? "w-[min(78%,calc(100%-360px))] shrink-0 border-l"
            : "max-w-[calc(100%-360px)] min-w-80 border-l",
      )}
      style={popped || expanded ? undefined : { width: width ?? DEFAULT_WIDTH }}
      aria-label="Browser"
    >
      {popped || expanded || !onWidthChange ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the browser"
          onPointerDown={resize}
          className={cn(
            "absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-brand/30",
            dragging && "bg-brand/40",
          )}
        />
      )}
      <div className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide"
          role="tablist"
        >
          {state.tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === state.active}
              onClick={() => browser.select(tab.id)}
              className={cn(
                "group/tab flex h-7 max-w-48 min-w-0 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-1 pl-2 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground",
                tab.id === state.active && "bg-hover text-foreground",
              )}
              title={tab.url}
            >
              {tab.loading ? (
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-brand" />
              ) : (
                <GlobeIcon className="size-3.5 shrink-0 text-foreground-subtlest" />
              )}
              <span className="truncate">{tab.title || hostOf(tab.url) || "New tab"}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  browser.close(tab.id);
                }}
                className="shrink-0 rounded p-0.5 text-foreground-subtlest opacity-0 group-hover/tab:opacity-100 hover:bg-hover hover:text-foreground"
                aria-label="Close tab"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
          <PaneButton label="New tab" onClick={() => void browser.open()}>
            <PlusIcon className="size-3.5" />
          </PaneButton>
        </div>
        {popped ? (
          <PaneButton label="Back into Abacus" onClick={() => void browser.dock()}>
            <PanelRightIcon className="size-3.5" />
          </PaneButton>
        ) : (
          <>
            <PaneButton label="Pop out" onClick={() => void browser.popOut()}>
              <SquareArrowOutUpRightIcon className="size-3.5" />
            </PaneButton>
            <PaneButton
              label={expanded ? "Collapse" : "Expand"}
              onClick={() => onExpandedChange(!expanded)}
            >
              {expanded ? (
                <Minimize2Icon className="size-3.5" />
              ) : (
                <Maximize2Icon className="size-3.5" />
              )}
            </PaneButton>
            <PaneButton label="Close browser" onClick={onClose}>
              <XIcon className="size-3.5" />
            </PaneButton>
          </>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(address);
        }}
        className="flex h-10 shrink-0 items-center gap-1 border-b px-2 pb-2"
      >
        <PaneButton
          label="Back"
          onClick={() => active && browser.back(active.id)}
          disabled={!active?.canGoBack}
        >
          <ArrowLeftIcon className="size-4" />
        </PaneButton>
        <PaneButton
          label="Forward"
          onClick={() => active && browser.forward(active.id)}
          disabled={!active?.canGoForward}
        >
          <ArrowRightIcon className="size-4" />
        </PaneButton>
        <PaneButton
          label={active?.loading ? "Stop" : "Reload"}
          onClick={() =>
            active && (active.loading ? browser.stop(active.id) : browser.reload(active.id))
          }
          disabled={!active}
        >
          {active?.loading ? <XIcon className="size-4" /> : <RotateCwIcon className="size-3.5" />}
        </PaneButton>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => {
            setEditing(true);
            event.target.select();
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEditing(false);
              event.currentTarget.blur();
            }
          }}
          placeholder="Type a URL"
          spellCheck={false}
          className="ml-1 h-7 min-w-0 flex-1 rounded-md border bg-input px-2.5 font-mono text-ui-sm outline-none placeholder:font-sans placeholder:text-foreground-subtlest focus:border-brand/50"
          aria-label="Address"
        />
      </form>

      <div className="relative min-h-0 flex-1">
        {state.agent ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="mt-2 rounded-full bg-brand px-2.5 py-0.5 text-ui-xs font-medium text-primary-foreground shadow">
              abacus is using the browser
            </span>
          </div>
        ) : null}
        <div
          ref={page}
          className={cn(
            "absolute inset-0",
            state.agent && "outline-2 -outline-offset-2 outline-brand",
          )}
        />
        {state.tabs.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <BrandMark className="size-7 text-foreground-subtle" />
            <h3 className="text-ui-lg font-medium">Browse with abacus</h3>
            <p className="max-w-sm text-ui-sm text-foreground-subtle">
              Type a URL, or ask abacus to open a site. It can read pages, click and type here while
              you watch.
            </p>
            <p className="text-ui-sm text-foreground-subtlest">
              Preview your app instead?{" "}
              <button
                type="button"
                onClick={() => void detect()}
                className="text-brand hover:underline"
              >
                Detect dev server
              </button>
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function PaneButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="shrink-0 rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      {/* Above: the page is a native view, and would cover a tooltip drawn below. */}
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Whether the browser pane is open, expanded, and how wide. It opens when the
 * agent starts browsing, or a file card opens a file there.
 */
export function useBrowserPane() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(savedWidth);
  useEffect(() => window.abacus?.browser.onShow(() => setOpen(true)), []);
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // Unsaved, the width still holds for this window.
    }
  }, [width]);
  return { open, setOpen, expanded, setExpanded, width, setWidth };
}

/** A window of the browser's own (popped out): the pane, filling it. Closing it docks the browser. */
export function BrowserApp() {
  useColorScheme();
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen bg-panel">
        <BrowserPane
          popped
          expanded={false}
          covered={false}
          onExpandedChange={() => {}}
          onClose={() => void window.abacus?.browser.dock()}
        />
      </div>
    </TooltipProvider>
  );
}
