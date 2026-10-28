// What the sidebar keeps at the top: pinned sessions above the groups and the
// projects, and pinned projects before the other projects, which follow by
// when they were last worked in. Like the groups, the main process keeps the
// pins and shares them between windows.

import { useSyncExternalStore } from "react";
import type { Pins, Project } from "./bridge.js";

const NOTHING_PINNED: Pins = { sessions: [], projects: [] };

/** Pin to the top of the list, or unpin. */
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [id, ...list];
}

export function toggleSessionPin(pins: Pins, sessionId: string): Pins {
  return { ...pins, sessions: toggle(pins.sessions, sessionId) };
}

export function toggleProjectPin(pins: Pins, path: string): Pins {
  return { ...pins, projects: toggle(pins.projects, path) };
}

/** When a project was last worked in: its newest session, or when it was last opened. */
export function lastActive(project: Project): number {
  return project.sessions.reduce(
    (latest, session) => Math.max(latest, Date.parse(session.updatedAt) || 0),
    Date.parse(project.activeAt) || 0,
  );
}

/** Pinned projects first, as they were pinned; then the rest, the last worked in first. */
export function orderProjects(projects: Project[], pinned: string[]): Project[] {
  const rank = (project: Project) => {
    const index = pinned.indexOf(project.path);
    return index < 0 ? pinned.length : index;
  };
  return [...projects].sort(
    (left, right) => rank(left) - rank(right) || lastActive(right) - lastActive(left),
  );
}

// ---- the store ------------------------------------------------------------

let current = NOTHING_PINNED;
let started = false;
const listeners = new Set<() => void>();

function publish(next: Pins): void {
  current = next;
  for (const listener of listeners) listener();
}

function bridge() {
  return typeof window === "undefined" ? undefined : window.abacus?.pins;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    const pins = bridge();
    if (pins) {
      pins.onChange(publish);
      void pins.list().then(publish, () => undefined);
    }
  }
  return () => listeners.delete(listener);
}

/** The sidebar's pins, the same in every window. */
export function usePins(): Pins {
  return useSyncExternalStore(subscribe, () => current);
}

/** Change the pins: shown at once, kept by the main process, told to the other windows. */
export function changePins(change: (pins: Pins) => Pins): void {
  const next = change(current);
  if (next === current) return;
  publish(next);
  void bridge()
    ?.save(next)
    .then(publish, () => undefined);
}
