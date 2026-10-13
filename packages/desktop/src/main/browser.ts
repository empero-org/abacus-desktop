// The window's browser: tabs as WebContentsViews laid over the pane the
// renderer draws. Pages live in their own session, apart from the app's, with
// no Node, no preload and every permission request denied.

import {
  WebContentsView,
  session,
  type BrowserWindow,
  type Rectangle,
  type WebContents,
} from "electron";
import type { BrowserState } from "@abacus/ui/bridge";

const PARTITION = "persist:abacus-browser";
let sessionReady = false;

function browserSession() {
  const browsing = session.fromPartition(PARTITION);
  if (!sessionReady) {
    sessionReady = true;
    // Camera, microphone, notifications, geolocation…: a page in a coding
    // tool has no business asking, and nobody is there to answer.
    browsing.setPermissionRequestHandler((_contents, _permission, decide) => decide(false));
    browsing.setPermissionCheckHandler(() => false);
  }
  return browsing;
}

/** What the person typed, as a URL: a scheme kept, a host given one, anything else searched. */
export function toUrl(input: string): string {
  const text = input.trim();
  if (!text) return "about:blank";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^localhost:\d/i.test(text)) return text;
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(text);
  if (local) return `http://${text}`;
  if (!/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text)) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

export class Browser {
  readonly #window: BrowserWindow;
  readonly #emit: (state: BrowserState) => void;
  readonly #tabs = new Map<number, WebContentsView>();
  #order: number[] = [];
  #active: number | null = null;
  #bounds: Rectangle | null = null;
  #shown: WebContentsView | null = null;
  #agent = false;
  #next = 1;

  constructor(window: BrowserWindow, emit: (state: BrowserState) => void) {
    this.#window = window;
    this.#emit = emit;
  }

  state(): BrowserState {
    return {
      tabs: this.#order.map((id) => {
        const contents = this.#tabs.get(id)!.webContents;
        return {
          id,
          url: contents.getURL(),
          title: contents.getTitle(),
          loading: contents.isLoading(),
          canGoBack: contents.navigationHistory.canGoBack(),
          canGoForward: contents.navigationHistory.canGoForward(),
        };
      }),
      active: this.#active,
      agent: this.#agent,
    };
  }

  open(input?: string): number {
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    view.setBackgroundColor("#ffffff");
    const id = this.#next++;
    this.#tabs.set(id, view);
    this.#order.push(id);
    const contents = view.webContents;
    const changed = () => this.#emit(this.state());
    for (const event of [
      "did-start-loading",
      "did-stop-loading",
      "did-navigate",
      "did-navigate-in-page",
      "page-title-updated",
    ] as const) {
      contents.on(event as "did-stop-loading", changed);
    }
    // A link that opens a window opens a tab here instead.
    contents.setWindowOpenHandler(({ url }) => {
      this.open(url);
      return { action: "deny" };
    });
    if (input) void contents.loadURL(toUrl(input)).catch(() => {});
    this.select(id);
    return id;
  }

  select(id: number): void {
    if (!this.#tabs.has(id)) return;
    this.#active = id;
    this.#show();
    this.#emit(this.state());
  }

  close(id: number): void {
    const view = this.#tabs.get(id);
    if (!view) return;
    if (this.#shown === view) {
      this.#window.contentView.removeChildView(view);
      this.#shown = null;
    }
    this.#tabs.delete(id);
    const index = this.#order.indexOf(id);
    this.#order = this.#order.filter((tab) => tab !== id);
    view.webContents.close();
    if (this.#active === id) {
      this.#active = this.#order[Math.min(index, this.#order.length - 1)] ?? null;
      this.#show();
    }
    this.#emit(this.state());
  }

  navigate(id: number, input: string): void {
    void this.#tabs
      .get(id)
      ?.webContents.loadURL(toUrl(input))
      .catch(() => {});
  }

  back(id: number): void {
    const history = this.#tabs.get(id)?.webContents.navigationHistory;
    if (history?.canGoBack()) history.goBack();
  }

  forward(id: number): void {
    const history = this.#tabs.get(id)?.webContents.navigationHistory;
    if (history?.canGoForward()) history.goForward();
  }

  reload(id: number): void {
    this.#tabs.get(id)?.webContents.reload();
  }

  stop(id: number): void {
    this.#tabs.get(id)?.webContents.stop();
  }

  /** Where the renderer's page area is; null while the pane is hidden or covered. */
  setBounds(bounds: Rectangle | null): void {
    this.#bounds = bounds;
    this.#show();
  }

  /** The active tab's page, opening a blank tab when there is none (for the agent). */
  page(): WebContents {
    if (this.#active === null) this.open();
    return this.#tabs.get(this.#active!)!.webContents;
  }

  setAgent(active: boolean): void {
    if (this.#agent === active) return;
    this.#agent = active;
    this.#emit(this.state());
  }

  destroy(): void {
    for (const id of this.#order) this.close(id);
  }

  #show(): void {
    const view = this.#active === null ? null : (this.#tabs.get(this.#active) ?? null);
    if (this.#shown && (this.#shown !== view || !this.#bounds)) {
      this.#window.contentView.removeChildView(this.#shown);
      this.#shown = null;
    }
    if (!view || !this.#bounds) return;
    view.setBounds(this.#bounds);
    if (this.#shown !== view) {
      this.#window.contentView.addChildView(view);
      this.#shown = view;
    }
  }
}
