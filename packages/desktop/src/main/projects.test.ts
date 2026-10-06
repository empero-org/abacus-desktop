import { describe, expect, it } from "vitest";
import { mergeProjects } from "./projects.js";

const session = (id: string, updatedAt: string) => ({
  id,
  title: id,
  model: "m",
  updatedAt,
  messageCount: 2,
});

describe("mergeProjects", () => {
  it("lists the CLI's workspaces and the folders opened here, newest activity first", () => {
    const projects = mergeProjects(
      {
        workspaces: [
          {
            workspace: "/work/api",
            exists: true,
            sessions: [session("a", "2026-10-05T10:00:00Z")],
          },
          {
            workspace: "/Users/me/site",
            exists: false,
            sessions: [session("b", "2026-10-06T09:00:00Z")],
          },
        ],
      },
      [{ path: "/work/fresh", name: "fresh", openedAt: "2026-10-06T11:00:00Z" }],
      () => true,
    );
    expect(projects.map((project) => [project.path, project.name, project.exists])).toEqual([
      ["/work/fresh", "fresh", true],
      ["/Users/me/site", "site", false],
      ["/work/api", "api", true],
    ]);
    expect(projects[2]!.sessions.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("counts opening a project here as activity", () => {
    const [project] = mergeProjects(
      {
        workspaces: [
          {
            workspace: "/work/api",
            exists: true,
            sessions: [session("a", "2026-10-01T10:00:00Z")],
          },
        ],
      },
      [{ path: "/work/api", name: "api", openedAt: "2026-10-06T08:00:00Z" }],
      () => true,
    );
    expect(project!.activeAt).toBe("2026-10-06T08:00:00Z");
  });

  it("still lists recent folders when the CLI listing is unavailable", () => {
    const projects = mergeProjects(
      null,
      [{ path: "/gone", name: "gone", openedAt: "2026-10-06T08:00:00Z" }],
      () => false,
    );
    expect(projects).toEqual([
      {
        path: "/gone",
        name: "gone",
        exists: false,
        sessions: [],
        activeAt: "2026-10-06T08:00:00Z",
      },
    ]);
  });
});
