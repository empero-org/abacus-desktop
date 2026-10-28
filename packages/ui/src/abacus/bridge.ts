// The contract between a window and its Electron main process.
//
// Types only: the preload script implements it with `contextBridge`, the
// renderer reads it from `window.abacus`, and the main process answers the
// channels. Nothing here may import Node or Electron, because the renderer
// compiles against it too.

export type RequestId = number | string;

/** Frames the main process forwards from `abacus app-server`. Replies to the window's own requests are not forwarded. */
export type ServerMessage =
  | { kind: "notification"; method: string; params: unknown }
  | { kind: "request"; id: RequestId; method: string; params: unknown }
  | { kind: "exit"; code: number | null; tail: string };

export type CliStatus =
  | { state: "ready"; path: string; version: string }
  | { state: "outdated"; path: string; version: string; minimum: string }
  | { state: "missing" };

export interface RecentWorkspace {
  path: string;
  name: string;
  openedAt: string;
}

export interface AppInfo {
  version: string;
  platform: "darwin" | "linux" | "win32" | string;
  cli: CliStatus;
}

/** One saved abacus session, as `abacus sessions --json` lists it. */
export interface ProjectSession {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
  messageCount: number;
  /** The session this one was forked from; absent from an older CLI. */
  forkedFrom?: string | null;
  /** Open in an abacus right now (a terminal or a window); absent when closed. */
  live?: SessionLive | null;
}

export interface SessionLive {
  /** `working` while a turn runs there. */
  state: "working" | "idle";
  /** What has it open: `tui`, `desktop` or `headless`. */
  frontEnd?: string;
}

/**
 * A group made in the sidebar. It gathers sessions from any project, and a
 * session sits in at most one group.
 */
export interface SessionGroup {
  id: string;
  name: string;
  /** Session ids, the most recently added first. */
  sessions: string[];
  collapsed?: boolean;
}

/** The sidebar's groups, kept by the main process and shared by every window. */
export interface GroupsBridge {
  list(): Promise<SessionGroup[]>;
  /** Replace every group; the other windows hear about it through `onChange`. */
  save(groups: SessionGroup[]): Promise<SessionGroup[]>;
  onChange(listener: (groups: SessionGroup[]) => void): () => void;
}

/** What the sidebar keeps at the top, the most recently pinned first. */
export interface Pins {
  /** Session ids, shown above the groups and the projects. */
  sessions: string[];
  /** Project paths, listed before the other projects. */
  projects: string[];
}

/** The sidebar's pins, kept and shared like the groups. */
export interface PinsBridge {
  list(): Promise<Pins>;
  save(pins: Pins): Promise<Pins>;
  onChange(listener: (pins: Pins) => void): () => void;
}

/**
 * A project in the sidebar: a folder with abacus sessions on this machine
 * (synced from another device included), or one opened here that has none yet.
 */
export interface Project {
  path: string;
  name: string;
  /** False for a project synced from another device whose folder is not here. */
  exists: boolean;
  sessions: ProjectSession[];
  /** Last activity: the newest session, or when the folder was last opened here. */
  activeAt: string;
}

/** The window's browser, as its pane shows it. */
export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserState {
  tabs: BrowserTab[];
  active: number | null;
  /** The agent is driving the browser right now. */
  agent: boolean;
}

export interface BrowserBridge {
  state(): Promise<BrowserState>;
  /** Open a tab, at `url` when given; resolves to its id. */
  open(url?: string): Promise<number>;
  /** A dev server listening on a usual localhost port, to preview; null when none answers. */
  detectDevServer(): Promise<string | null>;
  navigate(id: number, url: string): void;
  back(id: number): void;
  forward(id: number): void;
  reload(id: number): void;
  stop(id: number): void;
  select(id: number): void;
  close(id: number): void;
  /** Where the page goes, in window coordinates; null hides it. */
  setBounds(bounds: { x: number; y: number; width: number; height: number } | null): void;
  onState(listener: (state: BrowserState) => void): () => void;
  /** The agent started using the browser. */
  onAgent(listener: () => void): () => void;
}

/** Output from, or the end of, a terminal the window opened. */
export type TerminalEvent =
  | { kind: "data"; id: number; data: string }
  | { kind: "exit"; id: number; code: number | null };

export interface WorkspaceSession {
  workspace: string;
  name: string;
}

export interface AbacusBridge {
  appInfo(): Promise<AppInfo>;
  /** Re-run CLI detection, after the person installed or updated it. */
  detectCli(): Promise<CliStatus>;
  /** `abacus update --check`, as the CLI prints it. */
  checkForUpdate(): Promise<string>;

  recentWorkspaces(): Promise<RecentWorkspace[]>;
  /** Every project with sessions, newest activity first; null when the CLI cannot list them. */
  listProjects(): Promise<Project[] | null>;
  /** `abacus sync status`, as the CLI prints it. */
  syncStatus(): Promise<string>;
  forgetWorkspace(path: string): Promise<RecentWorkspace[]>;
  /** Show the folder picker; null when cancelled. */
  pickWorkspace(): Promise<string | null>;
  /** Start `abacus app-server` for this window in `path`. */
  openWorkspace(path: string): Promise<WorkspaceSession>;
  closeWorkspace(): Promise<void>;
  /** The workspace this window was opened for, if it was opened for one. */
  launchWorkspace(): Promise<string | null>;
  /** Open another window, optionally straight into a workspace. */
  newWindow(path?: string): Promise<void>;

  /** A JSON-RPC request to the app server; rejects with its error message. */
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** Answer a server request (an approval or a question) the agent is blocked on. */
  respond(id: RequestId, result: unknown): Promise<void>;
  /** Subscribe to server messages; returns the unsubscribe function. */
  onMessage(listener: (message: ServerMessage) => void): () => void;

  /**
   * Start a shell in the open project, or with `run: "update"` run
   * `abacus update` (no project needed); resolves to the terminal's id.
   */
  openTerminal(cols: number, rows: number, run?: "update"): Promise<number>;
  writeTerminal(id: number, data: string): void;
  resizeTerminal(id: number, cols: number, rows: number): void;
  closeTerminal(id: number): void;
  /** Subscribe to every terminal of this window; returns the unsubscribe function. */
  onTerminal(listener: (event: TerminalEvent) => void): () => void;

  browser: BrowserBridge;
  groups: GroupsBridge;
  pins: PinsBridge;

  /** Where a dropped or picked file lives on disk; null for one with no path (pasted from a browser). */
  pathForFile(file: File): string | null;

  openExternal(url: string): Promise<void>;
  revealPath(path: string): Promise<void>;
}

declare global {
  interface Window {
    abacus?: AbacusBridge;
  }
}
