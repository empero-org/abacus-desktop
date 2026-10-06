import { cn } from "@/components/lib/utils.js";

/**
 * A key cap (after shadcn's Kbd): one chip per key, fixed height and a square
 * minimum width, so symbol keys like ⌘ and ⇧ match letter keys; font-sans keeps
 * symbols from falling back to uneven monospace glyphs.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-ui-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The keys of one shortcut side by side, as in ⌘ K. */
function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
