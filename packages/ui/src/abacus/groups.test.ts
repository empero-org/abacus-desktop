import { describe, expect, it } from "vitest";
import type { Project, ProjectSession, SessionGroup } from "./bridge.js";
import {
  addGroup,
  arrange,
  countPlaced,
  moveSession,
  removeGroup,
  renameGroup,
  toggleGroup,
  type PlacedSession,
} from "./groups.js";

function session(id: string, updatedAt: string, forkedFrom?: string): ProjectSession {
  return { id, title: id, model: "m", updatedAt, messageCount: 2, forkedFrom: forkedFrom ?? null };
}

function project(path: string, sessions: ProjectSession[]): Project {
  return { path, name: path, exists: true, sessions, activeAt: sessions[0]?.updatedAt ?? "" };
}

/** A placed list as ids, forks in brackets: `a[b c[d]] e`. */
function shape(sessions: PlacedSession[]): string {
  return sessions
    .map((entry) =>
      entry.forks.length ? `${entry.session.id}[${shape(entry.forks)}]` : entry.session.id,
    )
    .join(" ");
}

const api = project("/work/api", [
  session("fork2", "2026-10-27T10:00:00Z", "main"),
  session("forkOfFork", "2026-10-27T09:30:00Z", "fork1"),
  session("fork1", "2026-10-27T09:00:00Z", "main"),
  session("main", "2026-10-26T09:00:00Z"),
  session("orphan", "2026-10-25T09:00:00Z", "deleted"),
]);
const site = project("/work/site", [session("s1", "2026-10-27T08:00:00Z")]);

describe("arrange", () => {
  it("nests forks under the session they came from, newest first", () => {
    const { projects } = arrange([api, site], []);
    expect(shape(projects.get("/work/api")!)).toBe("main[fork2 fork1[forkOfFork]] orphan");
    expect(shape(projects.get("/work/site")!)).toBe("s1");
  });

  it("shows a grouped session in its group only, and its forks follow it", () => {
    const groups: SessionGroup[] = [{ id: "g", name: "Release", sessions: ["main", "s1"] }];
    const arranged = arrange([api, site], groups);
    expect(shape(arranged.projects.get("/work/api")!)).toBe("orphan");
    expect(shape(arranged.projects.get("/work/site")!)).toBe("");
    // Mixed projects sort by activity, not by the order they were added.
    expect(shape(arranged.groups[0]!.sessions)).toBe("s1 main[fork2 fork1[forkOfFork]]");
  });

  it("lets a fork be grouped apart from the session it came from", () => {
    const groups: SessionGroup[] = [{ id: "g", name: "Spike", sessions: ["fork1"] }];
    const arranged = arrange([api], groups);
    expect(shape(arranged.projects.get("/work/api")!)).toBe("main[fork2] orphan");
    expect(shape(arranged.groups[0]!.sessions)).toBe("fork1[forkOfFork]");
  });

  it("ignores grouped ids that are no longer listed", () => {
    const groups: SessionGroup[] = [{ id: "g", name: "Old", sessions: ["gone"] }];
    expect(arrange([site], groups).groups[0]!.sessions).toEqual([]);
  });

  it("shows a pinned session above everything, as pinned, even out of a group", () => {
    const groups: SessionGroup[] = [{ id: "g", name: "Release", sessions: ["s1", "orphan"] }];
    const arranged = arrange([api, site], groups, ["s1", "main"]);
    expect(shape(arranged.pinned)).toBe("s1 main[fork2 fork1[forkOfFork]]");
    expect(shape(arranged.groups[0]!.sessions)).toBe("orphan");
    expect(shape(arranged.projects.get("/work/api")!)).toBe("");
    // Pins of sessions no longer listed are ignored.
    expect(shape(arrange([site], [], ["gone"]).pinned)).toBe("");
  });

  it("does not lose sessions to a loop in the fork links", () => {
    const loop = project("/work/loop", [
      session("a", "2026-10-27T10:00:00Z", "b"),
      session("b", "2026-10-27T09:00:00Z", "a"),
    ]);
    const shown = arrange([loop], []).projects.get("/work/loop")!;
    expect(countPlaced(shown)).toBe(2);
  });
});

describe("group edits", () => {
  const base: SessionGroup[] = [
    { id: "g1", name: "Bugs", sessions: ["a", "b"] },
    { id: "g2", name: "Ideas", sessions: [] },
  ];

  it("moves a session between groups and back to its project", () => {
    const moved = moveSession(base, "a", "g2");
    expect(moved.map((group) => group.sessions)).toEqual([["b"], ["a"]]);
    expect(moveSession(moved, "a", null).map((group) => group.sessions)).toEqual([["b"], []]);
  });

  it("adds, renames, folds and deletes", () => {
    const added = addGroup(base, "g3", "  ");
    expect(added[2]).toEqual({ id: "g3", name: "New group", sessions: [] });
    expect(renameGroup(added, "g3", " Release ")[2]!.name).toBe("Release");
    expect(renameGroup(added, "g3", "   ")[2]!.name).toBe("New group");
    const folded = toggleGroup(base, "g1");
    expect(folded[0]!.collapsed).toBe(true);
    expect(toggleGroup(folded, "g1")[0]).toEqual(base[0]);
    expect(removeGroup(base, "g1").map((group) => group.id)).toEqual(["g2"]);
  });
});
