// Dark by default, light on request, or follow the system. The choice lives in
// localStorage: it is a per-machine preference, not something a session owns.

import { useCallback, useEffect, useState } from "react";

export type ColorScheme = "dark" | "light" | "system";

const KEY = "abacus.colorScheme";
const EVENT = "abacus:color-scheme";

function stored(): ColorScheme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "system" ? value : "dark";
  } catch {
    return "dark";
  }
}

function apply(scheme: ColorScheme) {
  const dark =
    scheme === "dark" ||
    (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** The chosen scheme, kept in step with whoever changes it. Applies nothing. */
export function useColorSchemeChoice(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(stored);
  useEffect(() => {
    const sync = (event: Event) => setScheme((event as CustomEvent<ColorScheme>).detail);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return scheme;
}

export function chooseColorScheme(next: ColorScheme) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private storage off: the choice still applies to this window.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

/** Apply the chosen scheme to the document. Mount once, at the root. */
export function useColorScheme(): [ColorScheme, (scheme: ColorScheme) => void] {
  const scheme = useColorSchemeChoice();

  useEffect(() => {
    apply(scheme);
    if (scheme !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [scheme]);

  return [scheme, useCallback(chooseColorScheme, [])];
}
