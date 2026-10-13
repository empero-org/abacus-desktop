// The browser pane: tabs, an address bar, and the page, which is a native view
// the main process lays over the area this component reserves for it. The
// agent drives the same browser through its browser tools, and the pane says
// so while it does.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { BrowserState } from "../bridge.js";
import { BrandMark } from "./BrandMark.js";

const EMPTY: BrowserState = { tabs: [], active: null, agent: false };

export function BrowserPane({
  expanded,
  covered,
  onExpandedChange,
  onClose,
}: {
  expanded: boolean;
  /** Something of the window's sits over the pane (a panel, a dialog): the page steps aside. */
  covered: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
}) {
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
        covered || rect.width < 1 || rect.height < 1
          ? null
          : { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      browser.setBounds(null);
    };
  }, [browser, covered, active?.id, expanded]);

  if (!browser) return null;

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
        "flex shrink-0 flex-col border-l bg-panel",
        expanded ? "w-[min(78%,calc(100%-360px))]" : "w-[min(46%,720px)] min-w-[360px]",
      )}
      aria-label="Browser"
    >
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

/** Whether the browser pane is open and expanded; it opens when the agent starts browsing. */
export function useBrowserPane() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => window.abacus?.browser.onAgent(() => setOpen(true)), []);
  return { open, setOpen, expanded, setExpanded };
}
