// Recently opened workspaces, newest first, kept in the app's data directory.
//
// A missing or corrupt file is an empty list, never an error: this is a
// convenience, and nothing about opening a folder depends on it.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { RecentWorkspace } from "@abacus/ui/bridge";

const LIMIT = 20;

export class RecentWorkspaces {
  constructor(readonly file: string) {}

  static in(directory: string): RecentWorkspaces {
    return new RecentWorkspaces(join(directory, "recent-workspaces.json"));
  }

  list(): RecentWorkspace[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is RecentWorkspace =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as RecentWorkspace).path === "string",
      );
    } catch {
      return [];
    }
  }

  /** Folders that still exist: a deleted project should not sit in the list as a dead link. */
  existing(): RecentWorkspace[] {
    return this.list().filter((entry) => existsSync(entry.path));
  }

  touch(path: string, now = new Date()): RecentWorkspace[] {
    const entry: RecentWorkspace = {
      path,
      name: basename(path) || path,
      openedAt: now.toISOString(),
    };
    const next = [entry, ...this.list().filter((existing) => existing.path !== path)].slice(
      0,
      LIMIT,
    );
    this.#write(next);
    return next;
  }

  forget(path: string): RecentWorkspace[] {
    const next = this.list().filter((existing) => existing.path !== path);
    this.#write(next);
    return next;
  }

  #write(entries: RecentWorkspace[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(entries, null, 2));
    renameSync(temporary, this.file);
  }
}
