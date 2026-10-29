// The only surface the renderer has onto the machine: a typed bridge to the
// main process. The renderer never sees Node, Electron, or the child process.

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type {
  AbacusBridge,
  BrowserState,
  Pins,
  ServerMessage,
  SessionGroup,
  TerminalEvent,
} from "@abacus/ui/bridge";

const bridge: AbacusBridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  detectCli: () => ipcRenderer.invoke("cli:detect"),
  checkForUpdate: () => ipcRenderer.invoke("cli:checkUpdate"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),

  recentWorkspaces: () => ipcRenderer.invoke("workspace:recent"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  syncStatus: () => ipcRenderer.invoke("sync:status"),
  forgetWorkspace: (path) => ipcRenderer.invoke("workspace:forget", path),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  openWorkspace: (path, keep) => ipcRenderer.invoke("workspace:open", path, keep),
  activateSession: (server, keep) => ipcRenderer.invoke("session:activate", server, keep),
  stopSession: (server) => ipcRenderer.invoke("session:stop", server),
  closeWorkspace: () => ipcRenderer.invoke("workspace:close"),
  newWindow: (path) => ipcRenderer.invoke("window:new", path),
  launchWorkspace: () => ipcRenderer.invoke("workspace:launch"),

  request: (method, params, server) => ipcRenderer.invoke("abacus:request", method, params, server),
  respond: (id, result, server) => ipcRenderer.invoke("abacus:respond", id, result, server),
  onMessage: (listener) => {
    const handler = (_event: IpcRendererEvent, message: ServerMessage) => listener(message);
    ipcRenderer.on("abacus:message", handler);
    return () => ipcRenderer.removeListener("abacus:message", handler);
  },

  openTerminal: (cols, rows, run) => ipcRenderer.invoke("terminal:open", cols, rows, run),
  writeTerminal: (id, data) => ipcRenderer.send("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send("terminal:resize", id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send("terminal:close", id),
  onTerminal: (listener) => {
    const handler = (_event: IpcRendererEvent, event: TerminalEvent) => listener(event);
    ipcRenderer.on("terminal:event", handler);
    return () => ipcRenderer.removeListener("terminal:event", handler);
  },

  browser: {
    state: () => ipcRenderer.invoke("browser:state"),
    open: (url) => ipcRenderer.invoke("browser:open", url),
    detectDevServer: () => ipcRenderer.invoke("browser:detect"),
    navigate: (id, url) => ipcRenderer.send("browser:navigate", id, url),
    back: (id) => ipcRenderer.send("browser:back", id),
    forward: (id) => ipcRenderer.send("browser:forward", id),
    reload: (id) => ipcRenderer.send("browser:reload", id),
    stop: (id) => ipcRenderer.send("browser:stop", id),
    select: (id) => ipcRenderer.send("browser:select", id),
    close: (id) => ipcRenderer.send("browser:close", id),
    setBounds: (bounds) => ipcRenderer.send("browser:bounds", bounds),
    onState: (listener) => {
      const handler = (_event: IpcRendererEvent, state: BrowserState) => listener(state);
      ipcRenderer.on("browser:state", handler);
      return () => ipcRenderer.removeListener("browser:state", handler);
    },
    onAgent: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("browser:agent", handler);
      return () => ipcRenderer.removeListener("browser:agent", handler);
    },
  },

  groups: {
    list: () => ipcRenderer.invoke("groups:list"),
    save: (groups) => ipcRenderer.invoke("groups:save", groups),
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, groups: SessionGroup[]) => listener(groups);
      ipcRenderer.on("groups:changed", handler);
      return () => ipcRenderer.removeListener("groups:changed", handler);
    },
  },

  pins: {
    list: () => ipcRenderer.invoke("pins:list"),
    save: (pins) => ipcRenderer.invoke("pins:save", pins),
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, pins: Pins) => listener(pins);
      ipcRenderer.on("pins:changed", handler);
      return () => ipcRenderer.removeListener("pins:changed", handler);
    },
  },

  // Electron no longer puts the path on File; only the preload can ask for it.
  pathForFile: (file) => webUtils.getPathForFile(file) || null,

  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  revealPath: (path) => ipcRenderer.invoke("shell:reveal", path),
};

contextBridge.exposeInMainWorld("abacus", bridge);
