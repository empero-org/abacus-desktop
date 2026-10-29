// The window's own upkeep: whether a newer release is out (the sidebar's
// "Update available"), and "Report a bug", which sends what the terminal's
// /feedback sends.

import type { AbacusBridge } from "./bridge.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

/** How often a window that stays open asks again whether a release is out. */
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;
let updateTimer: ReturnType<typeof setInterval> | null = null;

/** Check now, and again every few hours while the window is open. */
export function watchUpdates(get: Get): void {
  void get().checkUpdates();
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => void get().checkUpdates(), UPDATE_CHECK_MS);
}

export function updateActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  errorMessage: (error: unknown) => string,
): Pick<AbacusState, "checkUpdates" | "showUpdates" | "sendReport"> {
  return {
    async checkUpdates() {
      try {
        set({ updates: await bridge.checkUpdates() });
      } catch {
        // Offline, or an older main process: no button, no complaint.
      }
    },

    showUpdates() {
      set({ view: "settings", settingsFocus: "updates" });
    },

    async sendReport(report) {
      if (get().phase !== "ready")
        return "Open a project or chat first: the report goes out through abacus.";
      if (!get().capabilities.feedback)
        return "This abacus is too old to send reports from the window. Update it, or use /feedback in the terminal.";
      try {
        await bridge.request("feedback/submit", {
          ...report,
          client: `abacus-desktop ${get().appInfo?.version ?? ""}`.trim(),
        });
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
  };
}
