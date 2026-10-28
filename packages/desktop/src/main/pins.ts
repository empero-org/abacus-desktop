// The sidebar's pins: sessions kept above the groups and the projects, and
// projects listed before the others. Kept beside the groups in the app's data
// directory and shared by every window.
//
// As with the groups, a missing or corrupt file is nothing pinned, never an
// error.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Pins } from "@abacus/ui/bridge";

export class SidebarPins {
  constructor(readonly file: string) {}

  static in(directory: string): SidebarPins {
    return new SidebarPins(join(directory, "sidebar-pins.json"));
  }

  list(): Pins {
    try {
      return sanitizePins(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return sanitizePins(null);
    }
  }

  /** Replace the pins with what the window sent, cleaned up; returns what was kept. */
  save(pins: unknown): Pins {
    const clean = sanitizePins(pins);
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(clean, null, 2));
    renameSync(temporary, this.file);
    return clean;
  }
}

/** Pins as the renderer may rely on them: two lists of strings, each pinned once. */
export function sanitizePins(value: unknown): Pins {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const strings = (list: unknown): string[] => [
    ...new Set(
      (Array.isArray(list) ? list : []).filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      ),
    ),
  ];
  return { sessions: strings(record.sessions), projects: strings(record.projects) };
}
