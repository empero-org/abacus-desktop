// Creating a workspace window with the frameless, Codex-style chrome.
//
// macOS keeps its traffic lights inset into our own title bar; Windows and
// Linux get a hidden title bar with native caption buttons drawn over it, so
// the app's top bar reaches the window edge on every platform.

import { BrowserWindow, shell } from "electron";
import { join } from "node:path";

/** Matches the UI's `--app-chrome-height`, so caption buttons line up with the top bar. */
export const TITLE_BAR_HEIGHT = 44;

const BACKGROUND = "#0e0b14";

export function createWindow(options: {
  preload: string;
  devServerUrl?: string;
  rendererHtml: string;
}): BrowserWindow {
  const mac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: BACKGROUND,
    title: "Abacus",
    titleBarStyle: mac ? "hiddenInset" : "hidden",
    trafficLightPosition: mac ? { x: 16, y: 15 } : undefined,
    titleBarOverlay: mac
      ? undefined
      : { color: BACKGROUND, symbolColor: "#bcb5c9", height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Links in a transcript open in the person's browser; the app window never
  // navigates away from itself, and never opens child windows.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      if (isExternalUrl(url)) void shell.openExternal(url);
    }
  });

  if (options.devServerUrl) void window.loadURL(options.devServerUrl);
  else void window.loadFile(options.rendererHtml);
  return window;
}

/** Only web links leave the app; file:, javascript: and custom schemes do not. */
export function isExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

export function rendererPaths(outDir: string): { preload: string; rendererHtml: string } {
  return {
    preload: join(outDir, "preload", "index.cjs"),
    rendererHtml: join(outDir, "renderer", "index.html"),
  };
}
