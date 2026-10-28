// The `abacus app-server` vocabulary, as the window sees it.
//
// The CLI is the source of truth for these shapes (src/app_server.rs in the
// abacus repo). Unknown fields are ignored and unknown methods are dropped,
// so a newer CLI never breaks an older window; it only goes unrendered.

import type { SessionLive } from "./bridge.js";

export const PROTOCOL_VERSION = 1;

/** AUTO reviews risky actions before they run; YOLO runs everything. */
export type AgentMode = "auto" | "yolo";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  uncachedInput: number;
  cacheRate: number | null;
  total: number;
}

export interface ThreadSummary {
  threadId: string;
  name: string;
  model: string;
  itemCount: number;
  updatedAt: string;
  /** The thread this one was forked from (CLI 0.7.1 and later). */
  forkedFrom?: string | null;
  /** Open in an abacus right now, this window included. */
  live?: SessionLive | null;
}

/** Who sent a message that did not come from the person: another session, or an agent of this one. */
export interface MessageSender {
  title: string;
  session?: string | null;
  /** A subagent sent it, or `main` in a subagent's transcript (CLI 0.7.2 and later). */
  agent?: boolean;
}

export type ToolItemType = "commandExecution" | "fileChange" | "functionCall";
/** `declined`: the call did not run; the safety review or the person stopped it. */
export type ToolStatus = "awaitingApproval" | "inProgress" | "completed" | "aborted" | "declined";

export type Item =
  | {
      id: string;
      type: "userMessage";
      text: string;
      images?: string[] | null;
      files?: string[];
      /** Set when another session's agent or a subagent wrote it, not the person. */
      from?: MessageSender | null;
      /** Background subagents' report; `from.title` names them (CLI 0.7.2 and later). */
      report?: boolean;
    }
  | { id: string; type: "agentMessage"; text: string }
  | { id: string; type: "reasoning"; text: string }
  /** Not from the server's items: the thread was compacted while idle (`thread/compacted`). */
  | { id: string; type: "contextCompaction"; savedTokens: number }
  /**
   * Where a reopened thread's history was compacted (CLI 0.7.1 and later): how
   * much was folded away there, and whether the summary stands in for it.
   */
  | { id: string; type: "contextCompaction"; messages: number; tokens: number; summarised: boolean }
  /** Not from the server's items: what one of the terminal's commands (`/memory`, `/usage`, …) said. */
  | { id: string; type: "commandOutput"; command: string; text: string }
  | {
      id: string;
      type: ToolItemType;
      name: string;
      command?: string;
      status: ToolStatus;
      output?: string;
      /** What the call is for, in the agent's words: "Running the unit tests" (CLI 0.7.2 and later). */
      description?: string;
      /** What a `send_message` call said (CLI 0.7.2 and later). */
      message?: string;
    };

export interface ThreadSnapshot {
  threadId: string;
  name: string;
  /** `provider/model`. */
  model: string;
  profile: string;
  mode: AgentMode;
  reasoningEffort: ReasoningEffort | null;
  workspace: string;
  contextWindow: number | null;
  /** How full the context is (CLI 0.7.1 and later). */
  contextTokens?: number;
  tokensUsed: number;
  usage: TokenUsage;
  items: Item[];
}

export interface InitializeResult {
  protocolVersion: number;
  serverInfo: { name: string; version: string };
  workspace: string;
  /** No provider yet: the window sets one up before the first turn. */
  needsSetup?: boolean;
  capabilities: Record<string, boolean>;
  /** Whether a long thread left idle is compacted (capability `idleCompaction`). */
  idleCompaction?: boolean;
  /** Model round trips one turn may take (capability `agentLimits`). */
  maxSteps?: number;
  /** Characters of tool output kept before truncation (capability `agentLimits`). */
  toolOutputLimit?: number;
  thread: ThreadSnapshot;
}

export interface ChangedFile {
  path: string;
  added: number | null;
  removed: number | null;
  binary: boolean;
}

/** What the session runs, as `config/value/write` and the profile methods answer. */
export interface ConfigValueResult {
  profile: string;
  model: string;
  mode: AgentMode;
  reasoningEffort: ReasoningEffort | null;
  contextWindow?: number | null;
  needsSetup?: boolean;
  idleCompaction?: boolean;
  maxSteps?: number;
  toolOutputLimit?: number;
}

export type WritableConfigKey =
  | "profile"
  | "reasoning_effort"
  | "mode"
  | "idle_compaction"
  | "max_steps"
  | "tool_output_limit";

/** The agent's limits, as `max_steps` and `tool_output_limit` set them. */
export interface AgentLimits {
  maxSteps: number;
  toolOutputLimit: number;
}

/** What `command/run` answers: what to show, and the turn `/goal` started. */
export interface CommandResult {
  text: string;
  turnId?: string | null;
}

export type Protocol = "chat-completions" | "responses" | "anthropic";

/** A profile: a `provider/model` and the settings it runs with. */
export interface ProfileEntry {
  name: string;
  model: string;
  provider: string;
  active: boolean;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  reasoningEffort: ReasoningEffort | null;
  toolFormat: string | null;
  roles: Record<string, string>;
}

/** A provider: an API connection and where its key comes from. */
export interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  protocol: Protocol;
  apiKeyEnv: string | null;
  /** Where the key comes from, in words — never the key. */
  key: string;
  keyMissing: boolean;
  hasStoredKey: boolean;
  authHeader: string | null;
  authFormat: string | null;
  tokenCommand: string;
  headers: Record<string, string>;
  /** JSON merged over every request body. */
  body: string;
  remove: string[];
  systemPrefix: string | null;
  requestUrl: string | null;
  modelsUrl: string | null;
  models: string[];
  local: boolean;
  modelCount: number | null;
  profiles: string[];
}

/** A ready-made provider to start from. */
export interface PresetEntry {
  id: string;
  name: string;
  baseUrl: string;
  protocol: Protocol;
  keyVariable: string | null;
  keyFound: boolean;
  local: boolean;
  hint: string;
}

/** A model a provider serves. `id` is `provider/model`. */
export interface ModelCardEntry {
  id: string;
  model: string;
  name: string | null;
  contextLength: number | null;
  maxOutputTokens: number | null;
  inputCost: number | null;
  outputCost: number | null;
  vision: boolean;
  reasoning: boolean;
}

/** What `provider/save` takes; fields left out stay as they are. */
export interface ProviderDraft {
  id?: string;
  preset?: string;
  name?: string;
  baseUrl?: string;
  protocol?: Protocol;
  apiKey?: string;
  apiKeyEnv?: string;
  authHeader?: string;
  authFormat?: string;
  tokenCommand?: string;
  headers?: string;
  body?: string;
  remove?: string;
  systemPrefix?: string;
  requestUrl?: string;
  modelsUrl?: string;
  models?: string;
}

/** What `profile/save` takes. Limits and effort take null for "detect / default". */
export interface ProfileDraft {
  name?: string;
  previousName?: string;
  model?: string;
  contextWindow?: number | string | null;
  maxOutputTokens?: number | string | null;
  reasoningEffort?: ReasoningEffort | null;
  /** Role → `provider/model`; an empty string hands the role back to its fallback. */
  roles?: Record<string, string>;
  select?: boolean;
}

/** A background worker (a subagent the agent started), as `tasks/list` reports it. */
export interface BackgroundTask {
  id: number;
  name: string;
  /** general, explore, or resumed for a worker continued by message. */
  role: string;
  model: string;
  prompt: string;
  state: "running" | "done" | "failed" | "stopped";
  /** The latest thing it did or said, one line. */
  activity: string;
  /** The tool it is in right now. */
  tool: string | null;
  toolUses: number;
  tokens: number;
  startedAt: string;
  finishedAt: string | null;
}

// ---- server -> client notifications -------------------------------------

export interface Notifications {
  "thread/started": { threadId: string };
  "thread/name/updated": { threadId: string; name: string };
  "thread/mode/updated": { threadId: string; mode: AgentMode; reason?: string };
  "thread/profile/updated": ConfigValueResult;
  "thread/tokenUsage/updated": {
    threadId: string;
    tokensUsed: number;
    contextTokens?: number;
    contextWindow: number | null;
    usage: TokenUsage;
  };
  "turn/started": { threadId: string; turnId: string };
  /** A steering message reached the model; `text` is what `turn/start` answered with. */
  "turn/steer/delivered": { threadId: string; text: string };
  /** `continues`: a steer this turn did not reach starts the next one at once. */
  "turn/completed": {
    threadId: string;
    turnId: string;
    status: string;
    name?: string;
    continues?: boolean;
  };
  "turn/diff/updated": { threadId: string; turnId: string; files: ChangedFile[] };
  /** The thread was summarised while nobody was using it, saving about `savedTokens` a request. */
  "thread/compacted": { threadId: string; reason: "idle"; savedTokens: number };
  "item/started": { threadId: string; turnId: string; startedAtMs: number; item: Item };
  "item/completed": { threadId: string; turnId: string; completedAtMs: number; item: Item };
  "item/agentMessage/delta": { threadId: string; turnId: string; itemId: string; delta: string };
  "item/reasoning/textDelta": { threadId: string; turnId: string; itemId: string; delta: string };
  warning: { message: string };
  "tasks/updated": { tasks: BackgroundTask[] };
}

export type NotificationMethod = keyof Notifications;

// ---- server -> client requests (the agent is blocked on a person) -------

/** Only asked when AUTO's safety review could not decide. */
export type ApprovalDecision = "accept" | "decline" | "cancel";

export interface ApprovalRequestParams {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  tool: string;
  /** One line: the command, or the file a change is to. */
  command: string;
  cwd: string;
  /** Why the person is asked. */
  reason?: string;
  /** The operation in full: `$ command`, or the change as a diff. */
  details?: string;
  /** What the call is for, in the agent's words (CLI 0.7.2 and later). */
  description?: string | null;
  availableDecisions: ApprovalDecision[];
}

export interface UserInputRequestParams {
  threadId: string;
  turnId: string;
  header?: string;
  question: string;
  options: string[];
  multiSelect: boolean;
}

export type ServerRequest =
  | { kind: "approval"; id: string | number; method: string; params: ApprovalRequestParams }
  | { kind: "question"; id: string | number; method: string; params: UserInputRequestParams };

export const APPROVAL_METHODS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
]);
export const QUESTION_METHOD = "tool/requestUserInput";

/** Classify a server request, or null for one this window does not know how to answer. */
export function classifyRequest(
  id: string | number,
  method: string,
  params: unknown,
): ServerRequest | null {
  if (APPROVAL_METHODS.has(method))
    return { kind: "approval", id, method, params: params as ApprovalRequestParams };
  if (method === QUESTION_METHOD)
    return { kind: "question", id, method, params: params as UserInputRequestParams };
  return null;
}
