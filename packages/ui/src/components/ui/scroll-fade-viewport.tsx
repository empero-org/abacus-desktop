import type { ComponentProps } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/components/lib/utils.js";

type ScrollMaskState = "none" | "top" | "bottom" | "both";

const SCROLL_MASK_CLASS_BY_STATE: Record<ScrollMaskState, string> = {
  none: "",
  top: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)]",
  // Underscores are spaces in a Tailwind arbitrary value; calc(100%-24px) would be invalid.
  bottom:
    "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)]",
  both: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)]",
};

export function ScrollFadeViewport({ className, children, ref, ...props }: ComponentProps<"div">) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [maskState, setMaskState] = useState<ScrollMaskState>("none");

  // The fade shares the caller's scroll node; scrolling behaviour stays the caller's.
  useImperativeHandle(ref, () => viewportRef.current!, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) {
      setMaskState("none");
      return;
    }

    const updateMaskState = () => {
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      if (maxScrollTop <= 1) {
        setMaskState("none");
        return;
      }

      const hasHiddenTop = viewport.scrollTop > 1;
      const hasHiddenBottom = viewport.scrollTop < maxScrollTop - 1;
      setMaskState(
        hasHiddenTop && hasHiddenBottom
          ? "both"
          : hasHiddenTop
            ? "top"
            : hasHiddenBottom
              ? "bottom"
              : "none",
      );
    };

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateMaskState();
      });
    };

    updateMaskState();
    viewport.addEventListener("scroll", updateMaskState, { passive: true });

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleUpdate);
      return () => {
        viewport.removeEventListener("scroll", updateMaskState);
        window.removeEventListener("resize", scheduleUpdate);
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      viewport.removeEventListener("scroll", updateMaskState);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [children]);

  return (
    <div
      ref={viewportRef}
      data-scroll-mask={maskState}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        SCROLL_MASK_CLASS_BY_STATE[maskState],
        className,
      )}
      {...props}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
