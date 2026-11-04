// The context bar above the composer: how full the model's context window
// is, as a thin line from empty to the window's size, with a tick where
// compaction steps in. Hovering it shows what fills the context, kind by
// kind, where compaction steps in, and what the session has spent.

import { useState } from "react";
import { cn } from "@/components/lib/utils.js";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card.js";
import { useAbacus } from "../context.js";
import { contextRows, shareLabel, type ContextRow } from "../contextUse.js";
import { compactNumber, compactionTicks, contextShare } from "../format.js";
import type { CompactionMarks, ContextUse, TokenUsage } from "../protocol.js";
import { usageRows } from "../usage.js";

export function ContextBar({
  contextTokens,
  contextWindow,
  compaction,
  tokensUsed,
  usage,
}: {
  contextTokens: number | null;
  contextWindow: number | null;
  /** Where compaction steps in; null from a CLI that does not say (before 0.7.7). */
  compaction: CompactionMarks | null;
  /** Every token the session has spent: not the context, and far larger on a long session. */
  tokensUsed: number;
  usage: TokenUsage | null;
}) {
  const asleep = useAbacus((state) => state.asleep);
  // What fills it, asked for each time the card opens; a sleeping thread is
  // not woken for it, and an abacus too old to say leaves it out.
  const [use, setUse] = useState<ContextUse | null>(null);
  const load = (open: boolean) => {
    if (!open || asleep || !window.abacus) return;
    window.abacus.request<ContextUse>("thread/context/read").then(setUse, () => setUse(null));
  };
  const share = contextTokens === null ? null : contextShare(contextTokens, contextWindow);
  if (share === null || contextTokens === null || !contextWindow) return null;
  const fill = Math.min(100, (contextTokens / contextWindow) * 100);
  const ticks = compactionTicks(compaction, contextWindow);
  // Past the summary point the next request is summarised first.
  const due = compaction !== null && contextTokens >= compaction.summary;

  const rows = use ? contextRows(use) : null;
  return (
    <HoverCard openDelay={150} closeDelay={100} onOpenChange={load}>
      <HoverCardTrigger asChild>
        <div
          className="group relative h-[19px] w-full cursor-default"
          tabIndex={0}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={contextWindow}
          aria-valuenow={contextTokens}
          aria-label={`Context ${share}% full`}
        >
          <span
            className={cn(
              "absolute bottom-[7px] -translate-x-1/2 font-mono text-[10px] leading-none text-foreground-subtlest tabular-nums group-hover:text-foreground-subtle",
              due && "text-warning group-hover:text-warning",
            )}
            style={{ left: `clamp(10px, ${fill}%, calc(100% - 64px))` }}
          >
            {share}%
          </span>
          <span className="absolute right-0 bottom-[7px] font-mono text-[10px] leading-none text-foreground-subtlest group-hover:text-foreground-subtle">
            {compactNumber(contextWindow)}
          </span>
          <span className="absolute inset-x-0 bottom-[2px] h-[2px] rounded-full bg-foreground/10" />
          <span
            className={cn(
              "absolute bottom-[2px] left-0 h-[2px] rounded-full bg-brand transition-[width] duration-500",
              due && "bg-warning",
            )}
            style={{ width: `${fill}%` }}
          />
          {ticks.map((tick) => (
            <span
              key={tick.kind}
              className={cn(
                "absolute bottom-0 h-[6px] w-px bg-foreground-subtlest/80",
                contextTokens >= tick.at && "bg-brand",
                due && contextTokens >= tick.at && "bg-warning",
              )}
              style={{ left: `${tick.position}%` }}
            />
          ))}
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-[22rem] p-3">
        <div className="flex flex-col gap-3 text-ui-sm">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Context</span>
            <div className="flex items-baseline justify-between gap-3">
              <span>{`${share}% used`}</span>
              <span className="font-mono opacity-80 tabular-nums">
                {`${compactNumber(contextTokens)} / ${compactNumber(contextWindow)}`}
              </span>
            </div>
            {rows ? <Breakdown rows={rows} /> : null}
          </div>
          {ticks.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Compaction</span>
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5">
                {ticks.map((tick) => (
                  <div key={tick.kind} className="contents">
                    <dt className="opacity-80">{tick.label}</dt>
                    <dd className="text-right font-mono tabular-nums">{compactNumber(tick.at)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">This session</span>
            <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5">
              {usageRows(usage, tokensUsed).map((row) => (
                <div key={row.label} className="contents">
                  <dt className="opacity-80">{row.label}</dt>
                  <dd
                    className={cn(
                      "text-right font-mono tabular-nums",
                      row.tone === "muted" && "opacity-70",
                      row.tone === "good" && "font-medium",
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {use?.estimated ? (
            <p className="opacity-70">
              Estimated from the text; the provider&apos;s own count replaces it after the next
              reply.
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** The context kind by kind: one bar of them all, then each with its share. */
function Breakdown({ rows }: { rows: ContextRow[] }) {
  const filled = rows.filter((row) => row.key !== "free" && row.key !== "buffer");
  const buffer = rows.find((row) => row.key === "buffer");
  return (
    <>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        {filled.map((row) => (
          <span key={row.key} className={row.color} style={{ width: `${row.share}%` }} />
        ))}
        <span className="flex-1" />
        {buffer ? <span className={buffer.color} style={{ width: `${buffer.share}%` }} /> : null}
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2.5 gap-y-1">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <span className={cn("size-2.5 rounded-[3px]", row.color)} />
            <dt className="truncate">
              {row.label}
              {row.count !== undefined ? (
                <span className="opacity-60">{` · ${row.count}`}</span>
              ) : null}
            </dt>
            <dd className="text-right font-mono tabular-nums">{compactNumber(row.tokens)}</dd>
            <dd className="w-12 text-right font-mono opacity-70 tabular-nums">
              {shareLabel(row.share)}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
