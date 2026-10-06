// Transient notices in the corner: errors from actions, warnings from the agent.

import { useEffect } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useAbacus } from "../context.js";
import type { Notice } from "../store.js";

const LIFETIME_MS = { info: 4000, warning: 8000, error: 12000 } as const;

export function Notices() {
  const notices = useAbacus((state) => state.notices);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {notices.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

function NoticeCard({ notice }: { notice: Notice }) {
  const dismiss = useAbacus((state) => state.dismissNotice);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), LIFETIME_MS[notice.tone]);
    return () => clearTimeout(timer);
  }, [dismiss, notice.id, notice.tone]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover px-3.5 py-3 text-ui-base shadow-lg",
        notice.tone === "error" && "border-destructive/40",
        notice.tone === "warning" && "border-warning/40",
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full bg-brand",
          notice.tone === "error" && "bg-destructive",
          notice.tone === "warning" && "bg-warning",
        )}
      />
      <p className="min-w-0 flex-1 break-words text-foreground">{notice.message}</p>
      <button
        type="button"
        onClick={() => dismiss(notice.id)}
        className="rounded p-0.5 text-foreground-subtlest hover:bg-hover hover:text-foreground"
        aria-label="Dismiss"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
