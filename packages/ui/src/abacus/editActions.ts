// What a turn edited: its own diff in the changes pane, and taking it back.

import type { AbacusBridge } from "./bridge.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

export function editActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  errorMessage: (error: unknown) => string,
): Pick<AbacusState, "showChanges" | "readDiff" | "undoEdits"> {
  return {
    showChanges(checkpoint) {
      set({ turnChanges: checkpoint });
    },

    async readDiff(checkpoint) {
      const params = checkpoint ? { checkpoint } : {};
      const { diff } = await bridge.request<{ diff: string }>("thread/diff/read", params);
      return diff;
    },

    async undoEdits(checkpoint) {
      try {
        const { files } = await bridge.request<{ files: string[] }>("turn/undo", { checkpoint });
        const what = files.length === 1 ? files[0] : `${files.length} files`;
        get().notify(`Undid the edits to ${what}.`, "info");
        return true;
      } catch (error) {
        get().notify(`Could not undo: ${errorMessage(error)}`, "error");
        return false;
      }
    },
  };
}
