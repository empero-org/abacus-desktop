// Ctrl (Cmd on macOS) with + and - makes everything in a window bigger or
// smaller, and with 0 puts it back; the size is kept for the next window and
// the next launch. Handled before the page sees the keys, so the "+" of a
// German keyboard (no Shift) and the "=" of a US one both zoom in.

import type { BrowserWindow, Input } from "electron";
import { readFileSync, writeFileSync } from "node:fs";

/** Half a level per press: Chromium's level 1 is 20% larger. */
const STEP = 0.5;
const LEVELS = { min: -3, max: 5 } as const;

/** What a key press asks of the zoom: in, out, back to normal, or nothing. */
export function zoomStep(
  input: Pick<Input, "type" | "key" | "control" | "meta" | "alt">,
): 1 | -1 | 0 | null {
  if (input.type !== "keyDown" || input.alt || !(input.control || input.meta)) return null;
  switch (input.key) {
    case "+":
    case "=":
    case "Add":
      return 1;
    case "-":
    case "_":
    case "Subtract":
      return -1;
    case "0":
      return 0;
    default:
      return null;
  }
}

/** A level kept within reach of normal. */
function clamp(level: number): number {
  return Math.min(LEVELS.max, Math.max(LEVELS.min, level));
}

/** The level after `step`, from `level`. */
export function zoomed(level: number, step: 1 | -1 | 0): number {
  return step === 0 ? 0 : clamp(level + step * STEP);
}

/** The level saved in `file`; normal when there is none, or it is garbled. */
export function savedLevel(file: string): number {
  try {
    const { level } = JSON.parse(readFileSync(file, "utf8")) as { level?: unknown };
    return typeof level === "number" && Number.isFinite(level) ? clamp(level) : 0;
  } catch {
    return 0;
  }
}

/** Zoom `window` from the keyboard, starting at the level saved in `file`. */
export function zoomWithKeys(window: BrowserWindow, file: string): void {
  const contents = window.webContents;
  contents.on("did-finish-load", () => contents.setZoomLevel(savedLevel(file)));
  contents.on("before-input-event", (event, input) => {
    const step = zoomStep(input);
    if (step === null) return;
    event.preventDefault();
    const level = zoomed(contents.getZoomLevel(), step);
    contents.setZoomLevel(level);
    try {
      writeFileSync(file, JSON.stringify({ level }));
    } catch {
      // Unsaved, it still holds for this window.
    }
  });
}
