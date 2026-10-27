// The sidebar's arrangement: groups made by hand, and forks nested under the
// session they branched from. Pure functions decide where each session shows;
// a small store keeps the groups in step with the main process, which shares
// them between windows.

import { useSyncExternalStore } from "react";
import type { Project, ProjectSession, SessionGroup } from "./bridge.js";

/** A session where the sidebar shows it, with its project and the forks shown under it. */
export interface PlacedSession {
  session: ProjectSession;
  project: Project;
  forks: PlacedSession[];
}

export interface Arrangement {
  /** Every group in the order it was made, with the sessions it shows, newest first. */
  groups: { group: SessionGroup; sessions: PlacedSession[] }[];
  /** By project path: the sessions shown under each project, in the listing's order. */
  projects: Map<string, PlacedSession[]>;
}

/**
 * Where each session shows. One in a group shows there, not under its project
 * as well. A fork follows the session it came from and nests under it, unless
 * it was put in a group of its own; a fork whose parent is gone stands alone.
 */
export function arrange(projects: Project[], groups: SessionGroup[]): Arrangement {
  const known = new Map<string, { session: ProjectSession; project: Project }>();
  for (const project of projects) {
    for (const session of project.sessions) {
      if (!known.has(session.id)) known.set(session.id, { session, project });
    }
  }
  const groupOf = new Map<string, string>();
  for (const group of groups) {
    for (const id of group.sessions) if (!groupOf.has(id)) groupOf.set(id, group.id);
  }
  const parentOf = (id: string): string | null => {
    const parent = known.get(id)?.session.forkedFrom;
    return parent && parent !== id && known.has(parent) ? parent : null;
  };

  // Where a session shows: its own group, else wherever the session it was
  // forked from shows, else its project. A loop in the fork links (which only
  // a hand-edited file could make) ends the walk where it closes.
  const home = (id: string): string => {
    const seen = new Set([id]);
    let current = id;
    for (;;) {
      const group = groupOf.get(current);
      if (group) return `group:${group}`;
      const parent = parentOf(current);
      if (!parent || seen.has(parent)) return `project:${known.get(current)!.project.path}`;
      seen.add(parent);
      current = parent;
    }
  };
  const looped = (id: string): boolean => {
    const seen = new Set<string>();
    for (let current = parentOf(id); current; current = parentOf(current)) {
      if (current === id) return true;
      if (seen.has(current)) return false;
      seen.add(current);
    }
    return false;
  };

  const placed = new Map<string, PlacedSession>();
  for (const [id, { session, project }] of known) placed.set(id, { session, project, forks: [] });
  const roots = new Map<string, PlacedSession[]>();
  for (const [id, node] of placed) {
    const parent = parentOf(id);
    const where = home(id);
    if (parent && home(parent) === where && !looped(id)) {
      placed.get(parent)!.forks.push(node);
      continue;
    }
    const list = roots.get(where);
    if (list) list.push(node);
    else roots.set(where, [node]);
  }

  const newestFirst = (left: PlacedSession, right: PlacedSession) =>
    Date.parse(right.session.updatedAt) - Date.parse(left.session.updatedAt);
  return {
    groups: groups.map((group) => ({
      group,
      sessions: [...(roots.get(`group:${group.id}`) ?? [])].sort(newestFirst),
    })),
    projects: new Map(
      projects.map((project) => [project.path, roots.get(`project:${project.path}`) ?? []]),
    ),
  };
}

/** Sessions with nothing nested, for a search that lists matches on their own. */
export function flat(project: Project): PlacedSession[] {
  return project.sessions.map((session) => ({ session, project, forks: [] }));
}

/** How many sessions a placed list shows, its forks included. */
export function countPlaced(sessions: PlacedSession[]): number {
  return sessions.reduce((sum, entry) => sum + 1 + countPlaced(entry.forks), 0);
}

export function groupOf(groups: SessionGroup[], sessionId: string): SessionGroup | null {
  return groups.find((group) => group.sessions.includes(sessionId)) ?? null;
}

export function addGroup(groups: SessionGroup[], id: string, name: string): SessionGroup[] {
  return [...groups, { id, name: name.trim() || "New group", sessions: [] }];
}

export function renameGroup(groups: SessionGroup[], id: string, name: string): SessionGroup[] {
  const trimmed = name.trim();
  if (!trimmed) return groups;
  return groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group));
}

/** Delete a group; its sessions go back under their projects. */
export function removeGroup(groups: SessionGroup[], id: string): SessionGroup[] {
  return groups.filter((group) => group.id !== id);
}

/** Put a session in a group (out of any other), or back under its project with `null`. */
export function moveSession(
  groups: SessionGroup[],
  sessionId: string,
  groupId: string | null,
): SessionGroup[] {
  return groups.map((group) => {
    const without = group.sessions.filter((id) => id !== sessionId);
    if (group.id === groupId) return { ...group, sessions: [sessionId, ...without] };
    return without.length === group.sessions.length ? group : { ...group, sessions: without };
  });
}

export function toggleGroup(groups: SessionGroup[], id: string): SessionGroup[] {
  return groups.map((group) => {
    if (group.id !== id) return group;
    if (group.collapsed) {
      const { collapsed: _, ...open } = group;
      return open;
    }
    return { ...group, collapsed: true };
  });
}

// ---- the store ------------------------------------------------------------

let current: SessionGroup[] = [];
let started = false;
const listeners = new Set<() => void>();

function publish(next: SessionGroup[]): void {
  current = next;
  for (const listener of listeners) listener();
}

function bridge() {
  return typeof window === "undefined" ? undefined : window.abacus?.groups;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    const groups = bridge();
    if (groups) {
      groups.onChange(publish);
      void groups.list().then(publish, () => undefined);
    }
  }
  return () => listeners.delete(listener);
}

/** The sidebar's groups, the same in every window. */
export function useGroups(): SessionGroup[] {
  return useSyncExternalStore(subscribe, () => current);
}

/**
 * Change the groups. The sidebar shows the change at once; the main process
 * keeps it and tells the other windows. Without a main process (a preview in a
 * browser) the change lasts as long as the page.
 */
export function changeGroups(change: (groups: SessionGroup[]) => SessionGroup[]): void {
  const next = change(current);
  if (next === current) return;
  publish(next);
  void bridge()
    ?.save(next)
    .then(publish, () => undefined);
}

/** A fresh group id. */
export function newGroupId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Groups just made from a menu, whose name the sidebar opens for editing once it shows them. */
export const freshGroups = new Set<string>();

/** The MIME type a dragged session row carries its id under. */
export const SESSION_DRAG_TYPE = "application/x-abacus-session";
