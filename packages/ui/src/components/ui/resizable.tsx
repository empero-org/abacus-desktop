// import { GripHorizontal, GripVertical } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

/* ------------------------------------------------------------------ */
/*  ResizablePanelGroup                                                */
/* ------------------------------------------------------------------ */

/**
 * A PanelGroup that remembers its layout in localStorage under layoutId (none
 * without one). panelIds is required when panels render conditionally.
 */
function ResizablePanelGroup({
  className,
  layoutId,
  panelIds,
  ...props
}: Omit<GroupProps, "defaultLayout" | "onLayoutChange" | "onLayoutChanged"> & {
  /** The storage key, useDefaultLayout's id. */
  layoutId: string;
  /** The ids of the panels shown, when panels render conditionally. */
  panelIds?: string[];
}) {
  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    id: layoutId,
    panelIds,
  });

  return (
    <Group
      className={cn("flex h-full w-full", className)}
      defaultLayout={defaultLayout}
      // The library's debounced onLayoutChange, not onLayoutChanged: a window
      // resize fires hundreds of layout updates, each a localStorage write.
      onLayoutChange={onLayoutChange}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  ResizablePanel                                                     */
/* ------------------------------------------------------------------ */

const ResizablePanel = Panel;
type ResizablePanelProps = PanelProps;

/* ------------------------------------------------------------------ */
/*  ResizableHandle                                                    */
/* ------------------------------------------------------------------ */

function ResizableHandle({ className, ...props }: SeparatorProps) {
  return (
    <Separator
      // The Separator sets aria-orientation (opposite to the group's), not
      // data-orientation, so that is what the size classes key off.

      className={cn(
        "group/handle relative flex shrink-0 items-center justify-center bg-transparent outline-none transition-colors focus:outline-none focus-visible:outline-none focus-visible:bg-border-hover/60 focus-visible:ring-0",
        "hover:bg-border-hover/60 data-[separator=hover]:bg-border-hover/60 data-[separator=active]:bg-border-hover z-10",

        // The library focuses the Separator on pointerdown; without its own
        // focus style Chromium draws the default focus outline on it.
        "aria-[orientation=vertical]:translate-x-px",
        "aria-[orientation=vertical]:my-6",
        "aria-[orientation=vertical]:w-px",
        "aria-[orientation=vertical]:h-[calc(100%-48px)]",
        "aria-[orientation=vertical]:[mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_82%,transparent_100%)]",
        "aria-[orientation=vertical]:[-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_82%,transparent_100%)]",

        "aria-[orientation=horizontal]:translate-y-px",
        "aria-[orientation=horizontal]:mx-6",
        "aria-[orientation=horizontal]:h-px",
        "aria-[orientation=horizontal]:w-[calc(100%-48px)]",
        "aria-[orientation=horizontal]:[mask-image:linear-gradient(to_right,transparent_0%,black_18%,black_82%,transparent_100%)]",
        "aria-[orientation=horizontal]:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_18%,black_82%,transparent_100%)]",

        className,
      )}
      {...props}
    >
      {/* <div
        className="z-10 flex items-center justify-center rounded-sm
          text-on-surface-muted/40
          transition-colors
          group-data-[orientation=horizontal]/handle:h-6
          group-data-[orientation=horizontal]/handle:w-3
          group-data-[orientation=vertical]/handle:h-3
          group-data-[orientation=vertical]/handle:w-6"
      >
        <GripVertical
          size={12}
          className="group-data-[orientation=vertical]/handle:hidden"
        />
        <GripHorizontal
          size={12}
          className="hidden group-data-[orientation=vertical]/handle:block"
        /> 
      </div>*/}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, type ResizablePanelProps };
