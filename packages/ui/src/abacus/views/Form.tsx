// The pieces the provider and profile editors and first-run setup share: a
// labelled field, and the fold that keeps the rarely needed ones out of sight.

import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-ui-sm text-foreground-subtle">{label}</span>
      {children}
      {hint ? <span className="text-ui-sm text-foreground-subtlest">{hint}</span> : null}
    </label>
  );
}

export function Advanced({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-ui-sm text-foreground-subtle hover:text-foreground">
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        Advanced
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-2 gap-3 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
