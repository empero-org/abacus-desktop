// The `/` commands this window carries out itself: switching mode, effort,
// model or theme, a new thread, settings, compaction, renaming. Anything else
// that starts with a slash goes to the app server, which knows the skills,
// plugin commands and `/btw`.

import { EFFORT_OPTIONS, MODE_OPTIONS, THEME_OPTIONS } from "./completion.js";
import type { AgentMode, ReasoningEffort } from "./protocol.js";
import type { AbacusState } from "./state.js";
import { chooseColorScheme, type ColorScheme } from "./useColorScheme.js";

/**
 * Carry out one of the window's `/` commands. False for anything else (a
 * skill, a plugin command, `/btw`, or text that merely starts with a
 * slash), which then goes to the app server as a prompt.
 */
export async function runWindowCommand(
  state: AbacusState,
  name: string,
  argument: string,
): Promise<boolean> {
  const choose = (options: string[], what: string) => {
    const value = argument.toLowerCase();
    if (options.includes(value)) return value;
    state.notify(`Choose a ${what}: ${options.join(", ")}.`, "warning");
    return null;
  };
  switch (name) {
    case "new":
      await state.newThread();
      return true;
    case "settings":
      state.setView("settings");
      return true;
    case "compact":
      await state.compact();
      return true;
    case "plan":
      await state.setMode(state.thread?.mode === "plan" ? "auto" : "plan");
      return true;
    case "mode": {
      const mode = choose(MODE_OPTIONS, "mode");
      if (mode) await state.setMode(mode as AgentMode);
      return true;
    }
    case "effort": {
      const effort = choose(EFFORT_OPTIONS, "reasoning effort");
      if (effort)
        await state.setReasoningEffort(effort === "auto" ? null : (effort as ReasoningEffort));
      return true;
    }
    case "theme": {
      const theme = choose(THEME_OPTIONS, "theme");
      if (theme) chooseColorScheme(theme as ColorScheme);
      return true;
    }
    case "model":
      if (!argument) state.setView("settings");
      else await state.setModel(argument);
      return true;
    case "rename":
      if (!argument) state.notify("Give the thread a name: /rename <name>.", "warning");
      else await state.renameThread(argument);
      return true;
    default:
      return false;
  }
}

/**
 * The effort Ctrl+T steps to: default, low, medium, high and back to default,
 * as in the terminal. A level off that ladder (minimal, extra high, max) steps
 * to the next rung.
 */
export function nextEffort(effort: ReasoningEffort | null): ReasoningEffort | null {
  switch (effort) {
    case null:
    case "minimal":
      return "low";
    case "low":
      return "medium";
    case "medium":
      return "high";
    default:
      return null;
  }
}
