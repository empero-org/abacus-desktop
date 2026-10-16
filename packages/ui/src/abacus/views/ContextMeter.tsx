// The top bar's context meter: how full the model's context window is, with
// what the session has spent (and how much of it the cache served) on hover.

import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { compactNumber, contextShare } from "../format.js";
import type { TokenUsage } from "../protocol.js";
import { usageRows } from "../usage.js";

export function ContextMeter({
  contextTokens,
  contextWindow,
  tokensUsed,
  usage,
}: {
  /** How full the context is; null from a CLI that does not say (before 0.7.1). */
  contextTokens: number | null;
  contextWindow: number | null;
  /** Every token the session has spent: not the context, and far larger on a long session. */
  tokensUsed: number;
  usage: TokenUsage | null;
}) {
  if (!contextTokens && tokensUsed === 0) return null;
  const share = contextTokens === null ? null : contextShare(contextTokens, contextWindow);
  const radius = 6;
  const circumference = 2 * Math.PI * radius;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ui-sm text-foreground-subtlest hover:bg-hover"
          tabIndex={0}
          aria-label={
            share !== null ? `Context ${share}% full` : `${compactNumber(tokensUsed)} tokens used`
          }
        >
          {share !== null ? (
            <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
              <circle
                cx="8"
                cy="8"
                r={radius}
                fill="none"
                strokeWidth="2"
                className="stroke-border"
              />
              <circle
                cx="8"
                cy="8"
                r={radius}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - share / 100)}
                className={cn("stroke-brand", share >= 85 && "stroke-warning")}
              />
            </svg>
          ) : null}
          <span className="font-mono">
            {share !== null ? `${share}%` : compactNumber(tokensUsed)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="min-w-52 px-3 py-2.5">
        <div className="flex flex-col gap-2 text-ui-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">Context</span>
            <span className="opacity-80">
              {contextTokens === null
                ? "This abacus version does not report it. Update the CLI."
                : `${compactNumber(contextTokens)}${
                    contextWindow ? ` of ${compactNumber(contextWindow)}` : ""
                  }${share !== null ? ` · ${share}% full` : ""}`}
            </span>
          </div>
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
