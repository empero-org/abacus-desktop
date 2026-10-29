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
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ServerMessage, WorkspaceSession } from "@abacus/ui/bridge";
import { Sessions } from "./sessions.js";
import { workspaceFromArgv } from "./argv.js";
import { cliSays, compareVersions, detectCli, resolveCli } from "./cli.js";
import { listSessions, mergeProjects } from "./projects.js";
import { Browser } from "./browser.js";
import { BROWSER_TOOLS, isBrowserTool, runBrowserTool } from "./browserTools.js";
import { SessionGroups } from "./groups.js";
import { SidebarPins } from "./pins.js";
import { RecentWorkspaces } from "./recent.js";
import { Terminals } from "./terminal.js";
import { checkUpdates } from "./updates.js";
import { createWindow, isExternalUrl, rendererPaths } from "./window.js";

const OUT_DIR = join(__dirname, "..");
const DEV_SERVER_URL = process.env.ABACUS_DESKTOP_DEV_URL;

const sessions = new Sessions({
  frame(contents, id, server, frame) {
    // The agent driving the browser: answered here, where the browser is.
    if (frame.kind === "request" && frame.method === "tool/call") {
      const { name, arguments: args } = (frame.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      if (isBrowserTool(name)) {
        if (!contents.isDestroyed()) contents.send("browser:agent");
        void runBrowserTool(browserFor(contents), name!, args ?? {}).then((answer) => {
          if (server.running) server.respond(frame.id, answer);
        });
        return;
      }
    }
    send(contents, { ...frame, server: id });
  },
  exit: (contents, id, code, tail) => send(contents, { kind: "exit", code, tail, server: id }),
  log(line) {
    if (DEV_SERVER_URL) console.error(`[abacus] ${line}`);
  },
});
/** Each window's browser, made when first used. */
const browsers = new Map<number, Browser>();

function browserFor(contents: WebContents): Browser {
  let browser = browsers.get(contents.id);
  if (!browser) {
    const window = BrowserWindow.fromWebContents(contents);
    if (!window) throw new Error("no window for this browser");
    browser = new Browser(window, (state) => {
      if (!contents.isDestroyed()) contents.send("browser:state", state);
    });
    browsers.set(contents.id, browser);
  }
  return browser;
}

/** Every window shows the same sidebar; the one that changed it already knows. */
function tellOtherWindows(sender: WebContents, channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents !== sender && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, value);
    }
  }
}

/** Ports dev servers usually listen on; the first that answers is the app to preview. */
const DEV_PORTS = [5173, 3000, 3001, 8080, 8000, 4321, 4200, 5000, 8888, 4173, 5174];

async function detectDevServer(): Promise<string | null> {
  const answers = await Promise.all(
    DEV_PORTS.map((port) =>
      fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(600) })
        .then(() => `http://localhost:${port}/`)
        .catch(() => null),
    ),
  );
  return answers.find(Boolean) ?? null;
}

/**
 * Where chats live: a folder of their own, opened with `app-server --chat`,
 * so a chat has no project's files to work on.
 */
let chatsDir = "";
/** The first CLI that holds a chat. */
const CHAT_CLI = "0.7.6";

/** The project each window has open; outlives an app server that crashed. */
const windowWorkspaces = new Map<number, string>();
let recent: RecentWorkspaces;
let groups: SessionGroups;
let pins: SidebarPins;
let terminals: Promise<Terminals> | null = null;
/** The terminal running `abacus update`, while one does: two installers at once would trip over each other. */
let updateTerminal: number | null = null;

/**
 * The terminal host, loaded on first use: the pty module is native, and a
 * platform without a prebuilt binary should lose the terminal pane, not the
 * whole app.
 */
function terminalHost(): Promise<Terminals> {
  terminals ??= import("@lydell/node-pty").then(({ spawn }) => {
    const host = new Terminals(spawn);
    host.on("event", (owner, event) => {
      if (event.kind === "exit" && event.id === updateTerminal) updateTerminal = null;
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
    sessions.closeWindow(id);
    closeTerminals(id);
    browsers.get(id)?.destroy();
    browsers.delete(id);
    windowWorkspaces.delete(id);
    launchWorkspaces.delete(id);
  });
  return window;
}

const launchWorkspaces = new Map<number, string>();

function send(contents: WebContents, message: ServerMessage): void {
  if (!contents.isDestroyed()) contents.send("abacus:message", message);
}

/** What the window calls a workspace: the folder's name, or "Chats". */
function nameOf(workspace: string): string {
  return workspace === chatsDir ? "Chats" : basename(workspace) || workspace;
}

/** Open `path` (or the chats) in the window, keeping the thread it showed running when `keep`. */
async function openWorkspace(
  event: IpcMainInvokeEvent,
  path: unknown,
  keep: unknown,
): Promise<WorkspaceSession> {
  const chat = path === chatsDir;
  if (chat) mkdirSync(chatsDir, { recursive: true });
  if (typeof path !== "string" || !existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error("that folder no longer exists");
  }
  const bin = resolveCli();
  if (!bin) throw new Error("the abacus CLI is not installed");
  if (chat) {
    const cli = await detectCli();
    if (cli.state === "missing" || compareVersions(cli.version, CHAT_CLI) < 0)
      throw new Error(`Chats need abacus ${CHAT_CLI} or newer. Update it in Settings, About.`);
  }
  const contents = event.sender;
  // Terminals open in the project; a new project gets new ones.
  if (windowWorkspaces.get(contents.id) !== path) closeTerminals(contents.id);
  windowWorkspaces.set(contents.id, path);
  const server = sessions.start(contents, bin, path, keep === true, chat ? ["--chat"] : []);
  // The chats are not a project to come back to.
  if (!chat) recent.touch(path);
  return { workspace: path, name: nameOf(path), server };
}

/** Show a parked thread again. */
function activateSession(event: IpcMainInvokeEvent, id: unknown, keep: unknown): WorkspaceSession {
  if (typeof id !== "number") throw new Error("id must be a number");
  const contents = event.sender;
  const { workspace } = sessions.activate(contents, id, keep === true);
  if (windowWorkspaces.get(contents.id) !== workspace) closeTerminals(contents.id);
  windowWorkspaces.set(contents.id, workspace);
  return { workspace, name: nameOf(workspace), server: id };
}

function registerIpc(): void {
  ipcMain.handle("app:info", async () => ({
    version: app.getVersion(),
    platform: process.platform,
    cli: await detectCli(),
    chats: chatsDir,
  }));
  ipcMain.handle("cli:detect", () => detectCli());
  ipcMain.handle("cli:checkUpdate", () => cliSays(["update", "--check"], 30_000));
  ipcMain.handle("updates:check", async () => {
    const cli = await detectCli();
    return checkUpdates(app.getVersion(), cli.state === "missing" ? null : cli.version);
  });

  ipcMain.handle("workspace:recent", () => recent.existing());
  ipcMain.handle("projects:list", async () => {
    const bin = resolveCli();
    const listing = bin ? await listSessions(bin) : null;
    // An older CLI cannot list every workspace; the renderer then falls back
    // to the open project's own thread list.
    if (!listing) return null;
    return mergeProjects(listing, recent.list(), (path) => existsSync(path));
  });
  ipcMain.handle("groups:list", () => groups.list());
  ipcMain.handle("groups:save", (event, value: unknown) => {
    const saved = groups.save(value);
    tellOtherWindows(event.sender, "groups:changed", saved);
    return saved;
  });
  ipcMain.handle("pins:list", () => pins.list());
  ipcMain.handle("pins:save", (event, value: unknown) => {
    const saved = pins.save(value);
    tellOtherWindows(event.sender, "pins:changed", saved);
    return saved;
  });
  ipcMain.handle("sync:status", () => cliSays(["sync", "status"], 20_000));
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
  ipcMain.handle("session:activate", activateSession);
  ipcMain.handle("session:stop", (event, id: unknown) => {
    if (typeof id === "number") sessions.stop(event.sender, id);
  });
  ipcMain.handle("workspace:close", (event) => {
    sessions.stopActive(event.sender);
    closeTerminals(event.sender.id);
    windowWorkspaces.delete(event.sender.id);
  });
  ipcMain.handle("window:new", (_event, path: unknown) => {
    openWindow(typeof path === "string" ? path : undefined);
  });

  ipcMain.handle("abacus:request", async (event, method: unknown, params: unknown, id: unknown) => {
    if (typeof method !== "string") throw new Error("method must be a string");
    const session = sessions.get(event.sender, typeof id === "number" ? id : undefined);
    const result = await session.request(method, params ?? {});
    // Lend the agent the browser, where the app server takes tools from us.
    if (
      method === "initialize" &&
      (result as { capabilities?: Record<string, boolean> })?.capabilities?.clientTools
    ) {
      await session.request("tools/register", { tools: BROWSER_TOOLS }).catch(() => {});
    }
    return result;
  });

  ipcMain.handle("browser:state", (event) => browserFor(event.sender).state());
  ipcMain.handle("browser:open", (event, url: unknown) =>
    browserFor(event.sender).open(typeof url === "string" ? url : undefined),
  );
  ipcMain.handle("browser:detect", () => detectDevServer());
  const tabAction =
    (act: (browser: Browser, id: number, ...rest: unknown[]) => void) =>
    (event: IpcMainEvent, id: unknown, ...rest: unknown[]) => {
      if (typeof id === "number") act(browserFor(event.sender), id, ...rest);
    };
  ipcMain.on(
    "browser:navigate",
    tabAction((browser, id, url) => browser.navigate(id, String(url ?? ""))),
  );
  ipcMain.on(
    "browser:back",
    tabAction((browser, id) => browser.back(id)),
  );
  ipcMain.on(
    "browser:forward",
    tabAction((browser, id) => browser.forward(id)),
  );
  ipcMain.on(
    "browser:reload",
    tabAction((browser, id) => browser.reload(id)),
  );
  ipcMain.on(
    "browser:stop",
    tabAction((browser, id) => browser.stop(id)),
  );
  ipcMain.on(
    "browser:select",
    tabAction((browser, id) => browser.select(id)),
  );
  ipcMain.on(
    "browser:close",
    tabAction((browser, id) => browser.close(id)),
  );
  ipcMain.on("browser:bounds", (event, bounds: unknown) => {
    const rect = bounds as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
    const valid =
      rect &&
      [rect.x, rect.y, rect.width, rect.height].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      );
    browserFor(event.sender).setBounds(
      valid
        ? {
            x: Math.round(rect.x as number),
            y: Math.round(rect.y as number),
            width: Math.max(0, Math.round(rect.width as number)),
            height: Math.max(0, Math.round(rect.height as number)),
          }
        : null,
    );
  });
  ipcMain.handle("abacus:respond", (event, id: unknown, result: unknown, server: unknown) => {
    if (typeof id !== "string" && typeof id !== "number")
      throw new Error("id must be a string or number");
    sessions.get(event.sender, typeof server === "number" ? server : undefined).respond(id, result);
  });

  // `run: "update"` runs `abacus update` in the terminal instead of a shell:
  // in a terminal, the installer can ask for the password a package needs.
  // It is the only command a window may ask for by name.
  ipcMain.handle("terminal:open", async (event, cols: unknown, rows: unknown, run: unknown) => {
    const update = run === "update";
    const workspace = windowWorkspaces.get(event.sender.id);
    if (!workspace && !update) throw new Error("open a project first");
    const bin = update ? resolveCli() : null;
    if (update && !bin) throw new Error("the abacus CLI is not installed");
    if (update && updateTerminal !== null) throw new Error("an update is already running");
    let host: Terminals;
    try {
      host = await terminalHost();
    } catch (error) {
      terminals = null;
      throw new Error(
        `the terminal is not available on this system (${error instanceof Error ? error.message : error})`,
      );
    }
    if (!bin) return host.open(event.sender.id, workspace ?? homedir(), Number(cols), Number(rows));
    if (updateTerminal !== null) throw new Error("an update is already running");
    updateTerminal = host.open(
      event.sender.id,
      workspace ?? homedir(),
      Number(cols),
      Number(rows),
      {
        file: bin,
        args: ["update"],
      },
    );
    return updateTerminal;
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
    groups = SessionGroups.in(app.getPath("userData"));
    pins = SidebarPins.in(app.getPath("userData"));
    chatsDir = join(app.getPath("userData"), "chats");
    registerIpc();
    openWindow(workspaceFromArgv(process.argv, process.cwd(), app.isPackaged));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => sessions.stopAll());
}
