// The only surface the renderer has onto the machine: a typed bridge to the
// main process. The renderer never sees Node, Electron, or the child process.

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type { AbacusBridge, ServerMessage, TerminalEvent } from "@abacus/ui/bridge";

const bridge: AbacusBridge = {
  appInfo: () => ipcRenderer.invoke("app:info"),
  detectCli: () => ipcRenderer.invoke("cli:detect"),

  recentWorkspaces: () => ipcRenderer.invoke("workspace:recent"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  syncStatus: () => ipcRenderer.invoke("sync:status"),
  forgetWorkspace: (path) => ipcRenderer.invoke("workspace:forget", path),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  openWorkspace: (path) => ipcRenderer.invoke("workspace:open", path),
  closeWorkspace: () => ipcRenderer.invoke("workspace:close"),
  newWindow: (path) => ipcRenderer.invoke("window:new", path),
  launchWorkspace: () => ipcRenderer.invoke("workspace:launch"),

  request: (method, params) => ipcRenderer.invoke("abacus:request", method, params),
  respond: (id, result) => ipcRenderer.invoke("abacus:respond", id, result),
  onMessage: (listener) => {
    const handler = (_event: IpcRendererEvent, message: ServerMessage) => listener(message);
    ipcRenderer.on("abacus:message", handler);
    return () => ipcRenderer.removeListener("abacus:message", handler);
  },

  openTerminal: (cols, rows) => ipcRenderer.invoke("terminal:open", cols, rows),
  writeTerminal: (id, data) => ipcRenderer.send("terminal:write", id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send("terminal:resize", id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send("terminal:close", id),
  onTerminal: (listener) => {
    const handler = (_event: IpcRendererEvent, event: TerminalEvent) => listener(event);
    ipcRenderer.on("terminal:event", handler);
    return () => ipcRenderer.removeListener("terminal:event", handler);
  },

  // Electron no longer puts the path on File; only the preload can ask for it.
  pathForFile: (file) => webUtils.getPathForFile(file) || null,

  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  revealPath: (path) => ipcRenderer.invoke("shell:reveal", path),
};

contextBridge.exposeInMainWorld("abacus", bridge);
