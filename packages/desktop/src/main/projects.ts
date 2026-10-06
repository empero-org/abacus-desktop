// The sidebar's projects: every workspace with abacus sessions on this machine,
// read from `abacus sessions --all --json` (sessions synced from other devices
// included), merged with the folders opened here that have none yet.

import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { Project, ProjectSession, RecentWorkspace } from "@abacus/ui/bridge";

interface Listing {
  workspaces: { workspace: string; exists: boolean; sessions: ProjectSession[] }[];
}

/** The CLI's listing, or null when it fails (a CLI that predates `--json`). */
export function listSessions(bin: string): Promise<Listing | null> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["sessions", "--all", "--json"],
      {
        timeout: 20_000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" },
      },
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          const parsed = JSON.parse(stdout) as Listing;
          resolve(Array.isArray(parsed.workspaces) ? parsed : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

export function mergeProjects(
  listing: Listing | null,
  recent: RecentWorkspace[],
  exists: (path: string) => boolean,
): Project[] {
  const projects = new Map<string, Project>();
  for (const entry of listing?.workspaces ?? []) {
    projects.set(entry.workspace, {
      path: entry.workspace,
      name: basename(entry.workspace) || entry.workspace,
      exists: entry.exists,
      sessions: entry.sessions,
      activeAt: entry.sessions[0]?.updatedAt ?? new Date(0).toISOString(),
    });
  }
  for (const entry of recent) {
    const known = projects.get(entry.path);
    if (known) {
      if (Date.parse(entry.openedAt) > Date.parse(known.activeAt)) known.activeAt = entry.openedAt;
      continue;
    }
    projects.set(entry.path, {
      path: entry.path,
      name: entry.name,
      exists: exists(entry.path),
      sessions: [],
      activeAt: entry.openedAt,
    });
  }
  return [...projects.values()].sort(
    (left, right) => Date.parse(right.activeAt) - Date.parse(left.activeAt),
  );
}
