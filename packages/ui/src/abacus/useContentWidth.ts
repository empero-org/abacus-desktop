// How wide the conversation and composer may grow. Like the theme, a
// per-machine preference in localStorage: a wide screen can show more than
// the reading width, and some people want the whole window.

import { useEffect, useState } from "react";

export type ContentWidth = "default" | "wide" | "wider" | "full";

const KEY = "abacus.contentWidth";
const EVENT = "abacus:content-width";

/** The cap each choice puts on the column; `none` lets it fill the window. */
const CONTENT_WIDTHS: Record<ContentWidth, string> = {
  default: "48rem",
  wide: "64rem",
  wider: "80rem",
  full: "none",
};

function stored(): ContentWidth {
  try {
    const value = localStorage.getItem(KEY);
    return value === "wide" || value === "wider" || value === "full" ? value : "default";
  } catch {
    return "default";
  }
}

/** The chosen width, kept in step with whoever changes it. Applies nothing. */
export function useContentWidthChoice(): ContentWidth {
  const [width, setWidth] = useState<ContentWidth>(stored);
  useEffect(() => {
    const sync = (event: Event) => setWidth((event as CustomEvent<ContentWidth>).detail);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return width;
}

export function chooseContentWidth(next: ContentWidth) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private storage off: the choice still applies to this window.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

/** Apply the chosen width as `--content-width`. Mount once, at the root. */
export function useContentWidth() {
  const width = useContentWidthChoice();
  useEffect(() => {
    document.documentElement.style.setProperty("--content-width", CONTENT_WIDTHS[width]);
  }, [width]);
}
