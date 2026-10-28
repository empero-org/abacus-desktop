// The window's actions on how the agent runs: its mode, effort, idle
// compaction and limits, each one `config/value/write` key, and the
// terminal's commands that answer with text (`/memory`, `/goal`, `/usage`,
// `/tools`, `/repair`), whose answer joins the transcript.

import type { AbacusBridge } from "./bridge.js";
import type { CommandResult, ConfigValueResult, WritableConfigKey } from "./protocol.js";
import type { AbacusState } from "./state.js";
import { withCommandOutput } from "./thread.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

interface Helpers {
  /** Runs an action, showing its failure as a notice. */
  guard(work: () => Promise<void>): Promise<void>;
  /** Takes the session's profile, model, mode and limits as the app server reports them. */
  applyConfig(result: ConfigValueResult): void;
}

type AgentActions = Pick<
  AbacusState,
  "setMode" | "setReasoningEffort" | "setIdleCompaction" | "setAgentLimit" | "runCommand"
>;

export function agentActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  { guard, applyConfig }: Helpers,
): AgentActions {
  const write = (key: WritableConfigKey, value: unknown) =>
    guard(async () =>
      applyConfig(await bridge.request<ConfigValueResult>("config/value/write", { key, value })),
    );

  return {
    setMode: (mode) => write("mode", mode),
    setReasoningEffort: (effort) => write("reasoning_effort", effort),
    setIdleCompaction: (enabled) => write("idle_compaction", enabled),
    setAgentLimit: (key, value) => write(key, value),

    runCommand: (name, argument) =>
      guard(async () => {
        if (!get().capabilities.commandRun) {
          get().notify(
            `This abacus is too old to run /${name} from the window. Update it, then reopen the project.`,
            "warning",
          );
          return;
        }
        const threadId = get().thread?.threadId;
        const { text } = await bridge.request<CommandResult>("command/run", { name, argument });
        // Shown in the thread it was asked in, if that is still the one open.
        const thread = get().thread;
        if (thread && thread.threadId === threadId)
          set({ thread: withCommandOutput(thread, name, text) });
      }),
  };
}
