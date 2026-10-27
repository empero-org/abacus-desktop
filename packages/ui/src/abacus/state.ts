// The shape of the window's state and its actions; the store implements it.

import type { Attachment } from "./attachments.js";
import type { AppInfo, CliStatus, Project, RecentWorkspace, WorkspaceSession } from "./bridge.js";
import type { CommandEntry } from "./completion.js";
import type {
  AgentMode,
  ApprovalDecision,
  BackgroundTask,
  Item,
  ModelCardEntry,
  PresetEntry,
  ProfileDraft,
  ProfileEntry,
  ProviderDraft,
  ProviderEntry,
  ReasoningEffort,
  ThreadSummary,
} from "./protocol.js";
import type { QueuedMessage } from "./queue.js";
import type { ThreadView } from "./thread.js";

export type Phase = "booting" | "welcome" | "connecting" | "ready" | "crashed";

export interface Notice {
  id: number;
  message: string;
  tone: "info" | "warning" | "error";
}

export interface AbacusState {
  phase: Phase;
  appInfo: AppInfo | null;
  cli: CliStatus | null;
  recent: RecentWorkspace[];
  workspace: WorkspaceSession | null;
  serverVersion: string | null;
  /** What the open app server says it can do (`imageInput`, …). */
  capabilities: Record<string, boolean>;
  threads: ThreadSummary[];
  /** Every project with sessions, for the sidebar; null when the CLI cannot list them. */
  projects: Project[] | null;
  thread: ThreadView | null;
  /** The main pane: the open thread, or settings. */
  view: "chat" | "settings";
  /** No provider or profile yet: the window sets one up before the first turn. */
  needsSetup: boolean;
  /** Whether a long thread left idle is compacted; an abacus setting, not the thread's. */
  idleCompaction: boolean;
  profiles: ProfileEntry[];
  providers: ProviderEntry[];
  /** The ready-made providers to start from. */
  presets: PresetEntry[];
  /** Each provider's models, by provider id, once asked for. */
  catalogs: Record<string, ModelCardEntry[]>;
  notices: Notice[];
  crash: { code: number | null; tail: string } | null;
  /** The composer's draft, kept per thread so switching threads does not lose it. */
  drafts: Record<string, string>;
  /** Messages written while abacus works, per thread, oldest first. */
  queued: Record<string, QueuedMessage[]>;
  /** The queued message each thread sends once the turn Send now stopped has ended. */
  sendingNow: Record<string, number>;
  /** Images and files waiting in the composer, per thread like the draft. */
  attachments: Record<string, Attachment[]>;
  /** The `/` commands to offer: this window's, then the app server's (skills, plugins). */
  commands: CommandEntry[];
  /** Background workers of this session, newest first. */
  tasks: BackgroundTask[];

  boot(): Promise<void>;
  refreshCli(): Promise<void>;
  pickAndOpen(): Promise<void>;
  openWorkspace(path: string): Promise<void>;
  closeWorkspace(): Promise<void>;
  forgetWorkspace(path: string): Promise<void>;
  refreshProjects(): Promise<void>;
  /** Open a session, switching project first when it belongs to another. */
  openSession(path: string, threadId: string): Promise<void>;
  /** A new thread in `path`, switching project first when it is another. */
  newThreadIn(path: string): Promise<void>;
  setView(view: AbacusState["view"]): void;

  newThread(): Promise<void>;
  openThread(threadId: string): Promise<void>;
  /** Continue a thread of this project (the open one by default) as a fork, and open the fork. */
  forkThread(threadId?: string): Promise<void>;
  renameThread(name: string): Promise<void>;
  refreshThreads(): Promise<void>;

  /** A new turn, or while one runs, a message queued for when it ends. */
  send(text: string): Promise<void>;
  /** Hand a queued message to the running turn; the model reads it after its current step. */
  steerQueued(id: number): Promise<void>;
  /** Stop the running turn and send a queued message straight after. */
  sendQueuedNow(id: number): Promise<void>;
  removeQueued(id: number): void;
  /** Take a queued message back into the composer. */
  editQueued(id: number): Promise<void>;
  interrupt(): Promise<void>;
  answerApproval(id: string | number, decision: ApprovalDecision): Promise<void>;
  answerQuestion(id: string | number, selected: string[], custom?: string): Promise<void>;

  /** Run another profile, from this session on and as the default. */
  selectProfile(name: string): Promise<void>;
  /** Add or change a profile; its name, or null when it could not be saved. */
  saveProfile(draft: ProfileDraft): Promise<string | null>;
  removeProfile(name: string): Promise<void>;
  /** Add or change a provider; its id, or null when it could not be saved. */
  saveProvider(draft: ProviderDraft): Promise<string | null>;
  removeProvider(id: string): Promise<void>;
  /** A provider's models, fetched again when `refresh`; the reason when it would not list them. */
  providerModels(
    id: string,
    refresh?: boolean,
  ): Promise<{ models: ModelCardEntry[]; error: string | null }>;
  refreshProfiles(): Promise<void>;
  setMode(mode: AgentMode): Promise<void>;
  setReasoningEffort(effort: ReasoningEffort | null): Promise<void>;
  setIdleCompaction(enabled: boolean): Promise<void>;
  setDraft(threadId: string, text: string): void;
  attach(files: File[]): Promise<void>;
  detach(id: string): void;
  /** Workspace files for `@` completion; empty when the app server cannot search. */
  searchFiles(query: string): Promise<string[]>;
  compact(): Promise<void>;
  stopTask(id: number): Promise<void>;
  clearTasks(): Promise<void>;
  /** A task and its transcript so far, or null when the app server no longer has it. */
  readTask(id: number): Promise<{ task: BackgroundTask; items: Item[] } | null>;
  notify(message: string, tone?: Notice["tone"]): void;
  dismissNotice(id: number): void;
}
