// The timers the agent set to wake itself: the person can take them back.

import type { AbacusBridge } from "./bridge.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;

export function timerActions(
  bridge: AbacusBridge,
  get: Get,
  errorMessage: (error: unknown) => string,
): Pick<AbacusState, "cancelTimer"> {
  return {
    async cancelTimer(id) {
      try {
        const params = id === "all" ? { all: true } : { id };
        const { cancelled } = await bridge.request<{ cancelled: number }>(
          "thread/timers/cancel",
          params,
        );
        return cancelled > 0;
      } catch (error) {
        get().notify(`Could not cancel the timer: ${errorMessage(error)}`, "error");
        return false;
      }
    },
  };
}
