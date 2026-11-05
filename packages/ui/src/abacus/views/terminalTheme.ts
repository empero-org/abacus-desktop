// The terminal pane's colours: the abacus palette, light and dark.

import type { ITheme } from "@xterm/xterm";

const DARK_ANSI = {
  black: "#2a2238",
  red: "#ff8f9b",
  green: "#7ee2a8",
  yellow: "#f2c46b",
  blue: "#8ab4ff",
  magenta: "#c792ff",
  cyan: "#7fdbe0",
  white: "#d4cde0",
  brightBlack: "#6a627a",
  brightRed: "#ffb0b8",
  brightGreen: "#a6f0c6",
  brightYellow: "#f8d896",
  brightBlue: "#adc9ff",
  brightMagenta: "#dcb6ff",
  brightCyan: "#a6eef2",
  brightWhite: "#ffffff",
};

const LIGHT_ANSI = {
  black: "#17121f",
  red: "#c42b3c",
  green: "#127a46",
  yellow: "#8a5600",
  blue: "#2f5bd3",
  magenta: "#7b3fe4",
  cyan: "#0e7c86",
  white: "#8f88a0",
  brightBlack: "#625b6f",
  brightRed: "#d9485a",
  brightGreen: "#1a9a5a",
  brightYellow: "#a86b00",
  brightBlue: "#4a74e6",
  brightMagenta: "#9255f0",
  brightCyan: "#13949f",
  brightWhite: "#453e51",
};

/** The abacus palette, read from the live tokens so it matches the scheme on screen. */
export function terminalTheme(): ITheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const dark = document.documentElement.classList.contains("dark");
  return {
    background: token("--color-terminal-bg"),
    foreground: token("--color-terminal-fg"),
    cursor: token("--color-brand"),
    cursorAccent: token("--color-terminal-bg"),
    selectionBackground: dark ? "rgba(182, 107, 255, 0.32)" : "rgba(123, 63, 228, 0.22)",
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
  };
}
