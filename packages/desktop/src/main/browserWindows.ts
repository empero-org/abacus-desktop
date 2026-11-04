// Each app window's browser, and the window it pops out into. The pages
// belong to the app window that opened them: its agent drives them, and its
// pane shows them. Popped out, they move into a window of their own that
// shows nothing but the browser, and they move back when that window closes.

import { BrowserWindow, type WebContents } from "electron";
import type { BrowserState } from "@abacus/ui/bridge";
import { Browser } from "./browser.js";
import { editWithRightClick } from "./editMenu.js";

export class BrowserWindows {
  /** Each app window's browser, by the app window's contents id. */
  readonly #browsers = new Map<number, Browser>();
  /** Popped-out windows, by the app window they belong to. */
  readonly #popouts = new Map<number, BrowserWindow>();
  /** The app window each popped-out window belongs to, by the popped-out window's contents id. */
  readonly #owners = new Map<number, number>();

  constructor(
    readonly preload: string,
    /** Load the renderer in browser-only mode into `window`. */
    readonly load: (window: BrowserWindow) => void,
  ) {}

  #ownerOf(contents: WebContents): number {
    return this.#owners.get(contents.id) ?? contents.id;
  }

  /** The browser `contents` drives: its own, or, from a popped-out window, its app window's. */
  for(contents: WebContents): Browser {
    const owner = this.#ownerOf(contents);
    let browser = this.#browsers.get(owner);
    if (!browser) {
      const window = BrowserWindow.fromWebContents(contents);
      if (!window) throw new Error("no window for this browser");
      browser = new Browser(window, (state) => this.#tell(owner, contents, state));
      this.#browsers.set(owner, browser);
    }
    return browser;
  }

  /** Both windows show the browser's tabs: the app's pane, and the popped-out window. */
  #tell(owner: number, contents: WebContents, state: BrowserState): void {
    if (!contents.isDestroyed()) contents.send("browser:state", state);
    const popout = this.#popouts.get(owner);
    if (popout && !popout.isDestroyed()) popout.webContents.send("browser:state", state);
  }

  /** Move the browser of `contents`'s app window into a window of its own, or bring that window forward. */
  popOut(contents: WebContents): void {
    const owner = this.#ownerOf(contents);
    const existing = this.#popouts.get(owner);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }
    const app = BrowserWindow.fromWebContents(contents);
    const browser = this.for(contents);
    const window = new BrowserWindow({
      width: 1100,
      height: 820,
      minWidth: 420,
      minHeight: 320,
      title: "Browser — Abacus",
      backgroundColor: "#0e0b14",
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    });
    editWithRightClick(window.webContents);
    const popoutId = window.webContents.id;
    this.#popouts.set(owner, window);
    this.#owners.set(popoutId, owner);
    browser.attach(window, true);
    window.on("closed", () => {
      this.#popouts.delete(owner);
      this.#owners.delete(popoutId);
      // Back into the app window's pane, unless that window is gone too.
      if (app && !app.isDestroyed()) browser.attach(app, false);
    });
    this.load(window);
  }

  /** Bring the browser back into its app window: its popped-out window closes. */
  dock(contents: WebContents): void {
    this.#popouts.get(this.#ownerOf(contents))?.close();
  }

  /** An app window closed: its browser, and any window it popped out into, go with it. */
  closeFor(owner: number): void {
    // The tabs first, while the window they may be shown in still stands.
    this.#browsers.get(owner)?.destroy();
    this.#browsers.delete(owner);
    const popout = this.#popouts.get(owner);
    this.#popouts.delete(owner);
    if (popout && !popout.isDestroyed()) {
      this.#owners.delete(popout.webContents.id);
      popout.removeAllListeners("closed");
      popout.destroy();
    }
  }
}
