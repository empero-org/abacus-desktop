// The sidebar's groups, kept in the app's data directory and shared by every
// window. Sessions are named by id, so a group can gather them from any project.
//
// Like the recent folders, a missing or corrupt file is no groups, never an
// error: losing the arrangement must not stop anything from opening.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SessionGroup } from "@abacus/ui/bridge";

export class SessionGroups {
  constructor(readonly file: string) {}

  static in(directory: string): SessionGroups {
    return new SessionGroups(join(directory, "session-groups.json"));
  }

  list(): SessionGroup[] {
    try {
      return sanitizeGroups(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return [];
    }
  }

  /** Replace every group with what the window sent, cleaned up; returns what was kept. */
  save(groups: unknown): SessionGroup[] {
    const clean = sanitizeGroups(groups);
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(clean, null, 2));
    renameSync(temporary, this.file);
    return clean;
  }
}

/**
 * Groups as the renderer may rely on them: well-formed, ids unique, and each
 * session in one group at most (the first that lists it keeps it).
 */
export function sanitizeGroups(value: unknown): SessionGroup[] {
  if (!Array.isArray(value)) return [];
  const groupIds = new Set<string>();
  const placed = new Set<string>();
  const groups: SessionGroup[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, sessions, collapsed } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || groupIds.has(id)) continue;
    if (typeof name !== "string") continue;
    groupIds.add(id);
    const members = (Array.isArray(sessions) ? sessions : []).filter(
      (session): session is string => typeof session === "string" && !placed.has(session),
    );
    for (const session of members) placed.add(session);
    groups.push({
      id,
      name: name.trim() || "Untitled group",
      sessions: members,
      ...(collapsed === true ? { collapsed: true } : {}),
    });
  }
  return groups;
}
