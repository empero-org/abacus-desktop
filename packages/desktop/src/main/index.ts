// The Abacus desktop main process: windows, and one `abacus app-server` per
// window. Everything a turn does happens in that child process; this file
// only routes frames between it and the window that owns it.

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  webContents,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { ServerMessage, WorkspaceSession } from "@abacus/ui/bridge";
import { AppServer } from "./appServer.js";
import { workspaceFromArgv } from "./argv.js";
import { detectCli, resolveCli } from "./cli.js";
import { listSessions, mergeProjects } from "./projects.js";
import { RecentWorkspaces } from "./recent.js";
import { Terminals } from "./terminal.js";
import { createWindow, isExternalUrl, rendererPaths } from "./window.js";

const OUT_DIR = join(__dirname, "..");
const DEV_SERVER_URL = process.env.ABACUS_DESKTOP_DEV_URL;

const sessions = new Map<number, AppServer>();
/** The project each window has open; outlives an app server that crashed. */
const windowWorkspaces = new Map<number, string>();
let recent: RecentWorkspaces;
let terminals: Promise<Terminals> | null = null;

/**
 * The terminal host, loaded on first use: the pty module is native, and a
 * platform without a prebuilt binary should lose the terminal pane, not the
 * whole app.
 */
function terminalHost(): Promise<Terminals> {
  terminals ??= import("@lydell/node-pty").then(({ spawn }) => {
    const host = new Terminals(spawn);
    host.on("event", (owner, event) => {
      const contents = webContents.fromId(owner);
      if (contents && !contents.isDestroyed()) contents.send("terminal:event", event);
    });
    return host;
  });
  return terminals;
}

function closeTerminals(owner: number): void {
  void terminals?.then((host) => host.closeAll(owner)).catch(() => {});
}

function openWindow(workspace?: string): BrowserWindow {
  const window = createWindow({ ...rendererPaths(OUT_DIR), devServerUrl: DEV_SERVER_URL });
  const id = window.webContents.id;
  if (workspace) {
    // The renderer asks for its launch workspace once it is ready to listen.
    launchWorkspaces.set(id, workspace);
  }
  window.on("closed", () => {
    stopSession(id);
    closeTerminals(id);
    windowWorkspaces.delete(id);
    launchWorkspaces.delete(id);
  });
  return window;
}

const launchWorkspaces = new Map<number, string>();

function send(contents: WebContents, message: ServerMessage): void {
  if (!contents.isDestroyed()) contents.send("abacus:message", message);
}

function stopSession(id: number): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  session.removeAllListeners();
  session.stop();
}

function sessionFor(event: IpcMainInvokeEvent): AppServer {
  const session = sessions.get(event.sender.id);
  if (!session?.running) throw new Error("no workspace is open in this window");
  return session;
}

async function openWorkspace(event: IpcMainInvokeEvent, path: unknown): Promise<WorkspaceSession> {
  if (typeof path !== "string" || !existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error("that folder no longer exists");
  }
  const bin = resolveCli();
  if (!bin) throw new Error("the abacus CLI is not installed");
  stopSession(event.sender.id);
  // Terminals open in the project; a new project gets new ones.
  closeTerminals(event.sender.id);
  windowWorkspaces.set(event.sender.id, path);

  const server = new AppServer(bin, path);
  const contents = event.sender;
  server.on("frame", (frame) => send(contents, frame));
  server.on("exit", (code, tail) => {
    if (sessions.get(contents.id) === server) sessions.delete(contents.id);
    send(contents, { kind: "exit", code, tail });
  });
  server.on("log", (line) => {
    if (DEV_SERVER_URL) console.error(`[abacus] ${line}`);
  });
  server.start();
  sessions.set(contents.id, server);
  recent.touch(path);
  return { workspace: path, name: basename(path) || path };
}

function syncStatus(): Promise<string> {
  const bin = resolveCli();
  if (!bin) return Promise.resolve("The abacus CLI is not installed.");
  return new Promise((resolve) => {
    execFile(
      bin,
      ["sync", "status"],
      { timeout: 20_000, windowsHide: true, env: { ...process.env, NO_COLOR: "1" } },
      (error, stdout, stderr) => {
        resolve((stdout || stderr || (error ? error.message : "")).trim());
      },
    );
  });
}

function registerIpc(): void {
  ipcMain.handle("app:info", async () => ({
    version: app.getVersion(),
    platform: process.platform,
    cli: await detectCli(),
  }));
  ipcMain.handle("cli:detect", () => detectCli());

  ipcMain.handle("workspace:recent", () => recent.existing());
  ipcMain.handle("projects:list", async () => {
    const bin = resolveCli();
    const listing = bin ? await listSessions(bin) : null;
    // An older CLI cannot list every workspace; the renderer then falls back
    // to the open project's own thread list.
    if (!listing) return null;
    return mergeProjects(listing, recent.list(), (path) => existsSync(path));
  });
  ipcMain.handle("sync:status", () => syncStatus());
  ipcMain.handle("workspace:forget", (_event, path: unknown) =>
    typeof path === "string" ? recent.forget(path) : recent.list(),
  );
  ipcMain.handle("workspace:pick", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Open a project folder",
      properties: ["openDirectory", "createDirectory"] as const,
    };
    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("workspace:launch", (event) => launchWorkspaces.get(event.sender.id) ?? null);
  ipcMain.handle("workspace:open", openWorkspace);
  ipcMain.handle("workspace:close", (event) => {
    stopSession(event.sender.id);
    closeTerminals(event.sender.id);
    windowWorkspaces.delete(event.sender.id);
  });
  ipcMain.handle("window:new", (_event, path: unknown) => {
    openWindow(typeof path === "string" ? path : undefined);
  });

  ipcMain.handle("abacus:request", (event, method: unknown, params: unknown) => {
    if (typeof method !== "string") throw new Error("method must be a string");
    return sessionFor(event).request(method, params ?? {});
  });
  ipcMain.handle("abacus:respond", (event, id: unknown, result: unknown) => {
    if (typeof id !== "string" && typeof id !== "number")
      throw new Error("id must be a string or number");
    sessionFor(event).respond(id, result);
  });

  ipcMain.handle("terminal:open", async (event, cols: unknown, rows: unknown) => {
    const workspace = windowWorkspaces.get(event.sender.id);
    if (!workspace) throw new Error("open a project first");
    let host: Terminals;
    try {
      host = await terminalHost();
    } catch (error) {
      terminals = null;
      throw new Error(
        `the terminal is not available on this system (${error instanceof Error ? error.message : error})`,
      );
    }
    return host.open(event.sender.id, workspace, Number(cols), Number(rows));
  });
  // Keystrokes and resizes are one-way: nothing waits on them.
  const onTerminal =
    (handle: (host: Terminals, event: IpcMainEvent, id: number, ...rest: unknown[]) => void) =>
    (event: IpcMainEvent, id: unknown, ...rest: unknown[]) => {
      if (typeof id !== "number") return;
      void terminals?.then((host) => handle(host, event, id, ...rest)).catch(() => {});
    };
  ipcMain.on(
    "terminal:write",
    onTerminal((host, event, id, data) => {
      if (typeof data === "string") host.write(event.sender.id, id, data);
    }),
  );
  ipcMain.on(
    "terminal:resize",
    onTerminal((host, event, id, cols, rows) =>
      host.resize(event.sender.id, id, Number(cols), Number(rows)),
    ),
  );
  ipcMain.on(
    "terminal:close",
    onTerminal((host, event, id) => host.close(event.sender.id, id)),
  );

  ipcMain.handle("shell:openExternal", (_event, url: unknown) => {
    if (typeof url === "string" && isExternalUrl(url)) return shell.openExternal(url);
  });
  ipcMain.handle("shell:reveal", async (_event, path: unknown) => {
    if (typeof path !== "string" || !existsSync(path)) return;
    // A folder opens in the file manager; a file is shown selected in its folder.
    if (statSync(path).isDirectory()) await shell.openPath(path);
    else shell.showItemInFolder(path);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const workspace = workspaceFromArgv(argv, workingDirectory, app.isPackaged);
    const [window] = BrowserWindow.getAllWindows();
    if (workspace) {
      openWindow(workspace);
    } else if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    } else {
      openWindow();
    }
  });

  void app.whenReady().then(() => {
    recent = RecentWorkspaces.in(app.getPath("userData"));
    registerIpc();
    openWindow(workspaceFromArgv(process.argv, process.cwd(), app.isPackaged));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    for (const id of sessions.keys()) stopSession(id);
  });
}
