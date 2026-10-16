// The `abacus app-server` vocabulary, as the window sees it.
//
// The CLI is the source of truth for these shapes (src/app_server.rs in the
// abacus repo). Unknown fields are ignored and unknown methods are dropped,
// so a newer CLI never breaks an older window; it only goes unrendered.

export const PROTOCOL_VERSION = 1;

export type AgentMode = "auto" | "plan" | "build";
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
}

export type ToolItemType = "commandExecution" | "fileChange" | "functionCall";
export type ToolStatus = "awaitingApproval" | "inProgress" | "completed" | "aborted";

export type Item =
  | { id: string; type: "userMessage"; text: string; images?: string[] | null; files?: string[] }
  | { id: string; type: "agentMessage"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: ToolItemType;
      name: string;
      command?: string;
      status: ToolStatus;
      output?: string;
    };

export interface ThreadSnapshot {
  threadId: string;
  name: string;
  model: string;
  profile: string;
  mode: AgentMode;
  autoApprove: boolean;
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
  capabilities: Record<string, boolean>;
  thread: ThreadSnapshot;
}

export interface ChangedFile {
  path: string;
  added: number | null;
  removed: number | null;
  binary: boolean;
}

export interface ConfigValueResult {
  model: string;
  mode: AgentMode;
  autoApprove: boolean;
  reasoningEffort: ReasoningEffort | null;
}

export type WritableConfigKey = "model" | "reasoning_effort" | "mode" | "autoApprove";

export interface ModelEntry {
  id: string;
  selected: boolean;
}

/** A background worker (a subagent the agent started), as `tasks/list` reports it. */
export interface BackgroundTask {
  id: number;
  name: string;
  /** scout, drone, worker, resumed, or an authored spec's id. */
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
  "thread/tokenUsage/updated": {
    threadId: string;
    tokensUsed: number;
    contextTokens?: number;
    contextWindow: number | null;
    usage: TokenUsage;
  };
  "turn/started": { threadId: string; turnId: string };
  "turn/completed": { threadId: string; turnId: string; status: string; name?: string };
  "turn/diff/updated": { threadId: string; turnId: string; files: ChangedFile[] };
  "item/started": { threadId: string; turnId: string; startedAtMs: number; item: Item };
  "item/completed": { threadId: string; turnId: string; completedAtMs: number; item: Item };
  "item/agentMessage/delta": { threadId: string; turnId: string; itemId: string; delta: string };
  "item/reasoning/textDelta": { threadId: string; turnId: string; itemId: string; delta: string };
  warning: { message: string };
  "tasks/updated": { tasks: BackgroundTask[] };
}

export type NotificationMethod = keyof Notifications;

// ---- server -> client requests (the agent is blocked on a person) -------

export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export interface ApprovalRequestParams {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  tool: string;
  command: string;
  cwd: string;
  reason?: string;
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
