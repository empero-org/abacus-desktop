// Small formatting helpers shared by the views.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "Yesterday", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const ago = now - at;
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`;
  if (ago < 2 * DAY) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Group threads under the headings Codex-style sidebars use. */
export function dayGroup(
  iso: string,
  now = new Date(),
): "Today" | "Yesterday" | "This week" | "Older" {
  const at = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= startOfToday) return "Today";
  if (at.getTime() >= startOfToday - DAY) return "Yesterday";
  if (at.getTime() >= startOfToday - 6 * DAY) return "This week";
  return "Older";
}

/** 1234 -> "1.2K", 3400000 -> "3.4M". */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Share of the context window used, 0-100, or null when the window is unknown. */
export function contextShare(tokensUsed: number, contextWindow: number | null): number | null {
  if (!contextWindow || contextWindow <= 0) return null;
  return Math.min(100, Math.round((tokensUsed / contextWindow) * 100));
}

/** A duration as "42s", "7m 09s" or "1h 05m". */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** 950 -> "950", 196_800 -> "196.8k", 2_400_000 -> "2.4M". */
export function tokenCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}
