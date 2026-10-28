// The `/` commands this window carries out itself: switching mode, effort,
// profile or theme, a new thread or a fork, settings, compaction, renaming,
// and the terminal's commands that answer with text (`/memory`, `/goal`,
// `/usage`, `/tools`, `/repair`), which the app server runs. Anything else
// that starts with a slash goes to the app server as a prompt: skills,
// plugin commands and `/btw`. `/steer` is the composer's (see messageActions).

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
    case "fork":
      if (!state.capabilities.fork) {
        state.notify(
          "This abacus is too old to fork from the window. Update it, then reopen the project.",
          "warning",
        );
        return true;
      }
      await state.forkThread();
      return true;
    case "settings":
      state.setView("settings");
      return true;
    case "compact":
      await state.compact();
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
    // `/model` is what the terminal used to call it.
    case "profile":
    case "model": {
      if (!argument) {
        state.setView("settings");
        return true;
      }
      const profile = findProfile(state, argument);
      if (profile) await state.selectProfile(profile);
      else
        state.notify(
          `No profile named ${argument}. Add one in settings, or choose one of: ${state.profiles
            .map((entry) => entry.name)
            .join(", ")}.`,
          "warning",
        );
      return true;
    }
    case "rename":
      if (!argument) state.notify("Give the thread a name: /rename <name>.", "warning");
      else await state.renameThread(argument);
      return true;
    // The names the terminal also answers to.
    case "memory":
    case "memories":
      await state.runCommand("memory", argument);
      return true;
    case "tools":
    case "skills":
    case "plugins":
    case "mcps":
      await state.runCommand("tools", "");
      return true;
    case "goal":
    case "usage":
    case "repair":
      await state.runCommand(name, argument);
      return true;
    default:
      return false;
  }
}

/** A profile by its name, or else the one profile running that `provider/model`. */
export function findProfile(state: Pick<AbacusState, "profiles">, name: string): string | null {
  const wanted = name.trim().toLowerCase();
  const named = state.profiles.find((entry) => entry.name.toLowerCase() === wanted);
  if (named) return named.name;
  const running = state.profiles.filter((entry) => entry.model.toLowerCase() === wanted);
  return running.length === 1 ? running[0]!.name : null;
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
