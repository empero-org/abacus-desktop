// The lists the window reads from the app server: profiles and providers,
// commands and background tasks. Each falls back to empty: an abacus without
// the method still leaves a working window.

import type { AbacusBridge } from "./bridge.js";
import { mergeCommands, type CommandEntry } from "./completion.js";
import type { BackgroundTask, PresetEntry, ProfileEntry, ProviderEntry } from "./protocol.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

export function serverLists(bridge: AbacusBridge, get: Get, set: Set) {
  return {
    async refreshProfiles() {
      if (!get().capabilities.profiles) return set({ profiles: [], providers: [] });
      try {
        const [{ profiles }, { providers }] = await Promise.all([
          bridge.request<{ profiles: ProfileEntry[] }>("profiles/list"),
          bridge.request<{ providers: ProviderEntry[] }>("providers/list"),
        ]);
        set({ profiles, providers });
      } catch {
        set({ profiles: [], providers: [] });
      }
    },

    async refreshPresets() {
      if (!get().capabilities.providers) return set({ presets: [] });
      try {
        const { presets } = await bridge.request<{ presets: PresetEntry[] }>("presets/list");
        set({ presets });
      } catch {
        set({ presets: [] });
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
