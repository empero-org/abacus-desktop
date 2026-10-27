import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionGroups, sanitizeGroups } from "./groups.js";

describe("SessionGroups", () => {
  it("keeps what was saved, for the next window to read", () => {
    const store = SessionGroups.in(mkdtempSync(join(tmpdir(), "abacus-groups-")));
    expect(store.list()).toEqual([]);
    store.save([{ id: "g1", name: "Release", sessions: ["a", "b"] }]);
    expect(store.list()).toEqual([{ id: "g1", name: "Release", sessions: ["a", "b"] }]);
  });

  it("reads a corrupt file as no groups", () => {
    const directory = mkdtempSync(join(tmpdir(), "abacus-groups-"));
    writeFileSync(join(directory, "session-groups.json"), "{not json");
    expect(SessionGroups.in(directory).list()).toEqual([]);
  });
});

describe("sanitizeGroups", () => {
  it("puts a session in one group only, and drops what is malformed", () => {
    expect(
      sanitizeGroups([
        { id: "g1", name: " Bugs ", sessions: ["a", 7, "b"], collapsed: true },
        { id: "g1", name: "duplicate id", sessions: [] },
        { id: "g2", name: "", sessions: ["b", "c"] },
        { name: "no id", sessions: ["d"] },
        "nonsense",
      ]),
    ).toEqual([
      { id: "g1", name: "Bugs", sessions: ["a", "b"], collapsed: true },
      { id: "g2", name: "Untitled group", sessions: ["c"] },
    ]);
  });

  it("treats anything but a list as no groups", () => {
    expect(sanitizeGroups({ id: "g1" })).toEqual([]);
    expect(sanitizeGroups(null)).toEqual([]);
  });
});
