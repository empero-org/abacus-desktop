// The lists the window reads from the app server: models, commands and
// background tasks. Each falls back to empty: a provider without a model
// listing, or an abacus without the method, still leaves a working window.

import type { AbacusBridge } from "./bridge.js";
import { mergeCommands, type CommandEntry } from "./completion.js";
import type { BackgroundTask, ModelEntry } from "./protocol.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

export function serverLists(bridge: AbacusBridge, get: Get, set: Set) {
  return {
    async refreshModels() {
      try {
        const { models } = await bridge.request<{ models: ModelEntry[] }>("model/list");
        set({ models });
      } catch {
        set({ models: [] });
      }
    },

    async refreshCommands() {
      if (!get().capabilities.commands) return set({ commands: mergeCommands([]) });
      try {
        const { commands } = await bridge.request<{ commands: CommandEntry[] }>("commands/list");
        set({ commands: mergeCommands(commands) });
      } catch {
        set({ commands: mergeCommands([]) });
      }
    },

    async refreshTasks() {
      if (!get().capabilities.tasks) return set({ tasks: [] });
      try {
        const { tasks } = await bridge.request<{ tasks: BackgroundTask[] }>("tasks/list");
        set({ tasks });
      } catch {
        set({ tasks: [] });
      }
    },
  };
}
