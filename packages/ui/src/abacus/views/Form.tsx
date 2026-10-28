// The pieces the provider and profile editors, first-run setup and settings
// share: a labelled field, the fold that keeps the rarely needed ones out of
// sight, and a whole number saved when it is left.

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Input } from "@/components/ui/input.js";
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

/** A whole number between `min` and `max`, saved when the field is left or Enter is pressed. */
export function LimitInput({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text.replace(/[\s,_]/g, ""));
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;
  const commit = () => {
    if (!valid) setText(String(value));
    else if (parsed !== value) onChange(parsed);
  };
  return (
    <Input
      className="w-28 text-right tabular-nums"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={!valid}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          // Settings closes on Escape; the field only gives its edit back.
          event.stopPropagation();
          setText(String(value));
        }
      }}
    />
  );
}
