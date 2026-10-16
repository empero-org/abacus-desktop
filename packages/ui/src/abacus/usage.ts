// What the context meter's tooltip says: how full the context is, then what
// the session has spent, the way the terminal's footer breaks it down.

import { compactNumber } from "./format.js";
import type { TokenUsage } from "./protocol.js";

export interface UsageRow {
  label: string;
  value: string;
  tone?: "good" | "muted";
}

/** The session's spending: input and output, then how much input the cache served. */
export function usageRows(usage: TokenUsage | null, tokensUsed: number): UsageRow[] {
  if (!usage) return [{ label: "All runs", value: compactNumber(tokensUsed) }];
  const rows: UsageRow[] = [
    { label: "Input", value: compactNumber(usage.input) },
    { label: "Output", value: compactNumber(usage.output) },
  ];
  if (usage.cacheRate === null) {
    rows.push({ label: "Cache", value: "not reported", tone: "muted" });
  } else {
    rows.push({
      label: "Cached",
      value: `${compactNumber(usage.cacheRead)} · ${usage.cacheRate}%`,
      tone: "good",
    });
    rows.push({ label: "Uncached", value: compactNumber(usage.uncachedInput), tone: "muted" });
    if (usage.cacheWrite > 0) {
      rows.push({ label: "Written", value: compactNumber(usage.cacheWrite), tone: "muted" });
    }
  }
  // The rows above count this run; the total also carries every earlier run
  // of a resumed session, which is why it can dwarf them.
  rows.push({ label: "All runs", value: compactNumber(usage.total), tone: "muted" });
  return rows;
}
