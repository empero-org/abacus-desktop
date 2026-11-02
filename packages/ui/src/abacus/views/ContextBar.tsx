// The context bar above the composer: how full the model's context window
// is, as a thin line from empty to the window's size, with a tick where
// compaction steps in. Hovering it shows the figures behind it and what the
// session has spent.

import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { compactNumber, compactionTicks, contextShare } from "../format.js";
import type { CompactionMarks, TokenUsage } from "../protocol.js";
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
  const share = contextTokens === null ? null : contextShare(contextTokens, contextWindow);
  if (share === null || contextTokens === null || !contextWindow) return null;
  const fill = Math.min(100, (contextTokens / contextWindow) * 100);
  const ticks = compactionTicks(compaction, contextWindow);
  // Past the summary point the next request is summarised first.
  const due = compaction !== null && contextTokens >= compaction.summary;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent side="top" className="min-w-60 px-3 py-2.5">
        <div className="flex flex-col gap-2 text-ui-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Context</span>
            <span className="opacity-80">
              {`${compactNumber(contextTokens)} of ${compactNumber(contextWindow)} · ${share}% full`}
            </span>
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
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
