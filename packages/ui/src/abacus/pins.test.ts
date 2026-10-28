import { describe, expect, it } from "vitest";
import type { Project, ProjectSession } from "./bridge.js";
import { lastActive, orderProjects, toggleProjectPin, toggleSessionPin } from "./pins.js";

function session(id: string, updatedAt: string): ProjectSession {
  return { id, title: id, model: "m", updatedAt, messageCount: 2, forkedFrom: null };
}

function project(path: string, activeAt: string, sessions: ProjectSession[]): Project {
  return { path, name: path, exists: true, sessions, activeAt };
}

const old = project("/work/old", "2026-10-01T09:00:00Z", [session("o", "2026-10-01T09:00:00Z")]);
// Listed earlier than its newest session: the open project's live threads run ahead.
const busy = project("/work/busy", "2026-10-02T09:00:00Z", [
  session("b2", "2026-10-03T09:00:00Z"),
  session("b1", "2026-10-02T09:00:00Z"),
]);
// Opened just now, with no session yet.
const opened = project("/work/new", "2026-10-04T09:00:00Z", []);

describe("orderProjects", () => {
  it("puts the projects worked in last first", () => {
    expect(lastActive(busy)).toBe(Date.parse("2026-10-03T09:00:00Z"));
    expect(orderProjects([old, busy, opened], []).map((entry) => entry.path)).toEqual([
      "/work/new",
      "/work/busy",
      "/work/old",
    ]);
  });

  it("puts pinned projects before the rest, the latest pinned first", () => {
    const pinned = toggleProjectPin(
      toggleProjectPin({ sessions: [], projects: [] }, "/work/old"),
      "/work/busy",
    );
    expect(pinned.projects).toEqual(["/work/busy", "/work/old"]);
    expect(orderProjects([old, busy, opened], pinned.projects).map((entry) => entry.path)).toEqual([
      "/work/busy",
      "/work/old",
      "/work/new",
    ]);
  });
});

describe("toggleSessionPin", () => {
  it("pins to the top and unpins", () => {
    const once = toggleSessionPin({ sessions: ["a"], projects: [] }, "b");
    expect(once.sessions).toEqual(["b", "a"]);
    expect(toggleSessionPin(once, "a").sessions).toEqual(["b"]);
  });
});
