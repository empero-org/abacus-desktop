// What fills the context, as the context bar's card lists it: each kind with
// its share of the window, then the room left before compaction steps in, and
// the room compaction keeps.

import type { ContextUse } from "./protocol.js";

export interface ContextRow {
  key: string;
  label: string;
  tokens: number;
  /** Of the window, 0–100. */
  share: number;
  /** A class for the kind's swatch and its stretch of the bar. */
  color: string;
  count?: number;
}

const COLORS: Record<string, string> = {
  messages: "bg-brand",
  system: "bg-sky-500",
  instructions: "bg-indigo-400",
  tools: "bg-orange-500",
  mcp: "bg-emerald-500",
  app: "bg-pink-500",
  extensions: "bg-amber-400",
  memory: "bg-lime-500",
  summary: "bg-cyan-400",
  session: "bg-slate-400",
  free: "bg-foreground/10",
  buffer: "bg-foreground/30",
};

/**
 * The card's rows: what is in the context, largest first, then the free
 * space before compaction and the buffer past it. With no window known,
 * shares are of what is used.
 */
export function contextRows(use: ContextUse): ContextRow[] {
  const whole = use.window ?? Math.max(use.used, 1);
  const row = (key: string, label: string, tokens: number, count?: number): ContextRow => ({
    key,
    label,
    tokens,
    share: (tokens / whole) * 100,
    color: COLORS[key] ?? "bg-slate-400",
    ...(count === undefined ? {} : { count }),
  });
  const rows = [...use.parts]
    .sort((a, b) => b.tokens - a.tokens)
    .map((part) => row(part.key, part.label, part.tokens, part.count));
  if (use.window) {
    const compactsAt = Math.min(use.compactsAt || use.window, use.window);
    rows.push(row("free", "Free space", Math.max(0, compactsAt - use.used)));
    const buffer = use.window - Math.max(compactsAt, use.used);
    if (buffer > 0) rows.push(row("buffer", "Compaction buffer", buffer));
  }
  return rows;
}

/** "28.6%", "0.4%", "<0.1%". */
export function shareLabel(share: number): string {
  if (share > 0 && share < 0.1) return "<0.1%";
  return `${share.toFixed(1)}%`;
}
