import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SidebarPins, sanitizePins } from "./pins.js";

describe("SidebarPins", () => {
  it("keeps what was saved, for the next window to read", () => {
    const store = SidebarPins.in(mkdtempSync(join(tmpdir(), "abacus-pins-")));
    expect(store.list()).toEqual({ sessions: [], projects: [] });
    store.save({ sessions: ["a"], projects: ["/work/api"] });
    expect(store.list()).toEqual({ sessions: ["a"], projects: ["/work/api"] });
  });

  it("reads a corrupt file as nothing pinned", () => {
    const directory = mkdtempSync(join(tmpdir(), "abacus-pins-"));
    writeFileSync(join(directory, "sidebar-pins.json"), "{not json");
    expect(SidebarPins.in(directory).list()).toEqual({ sessions: [], projects: [] });
  });
});

describe("sanitizePins", () => {
  it("keeps each pin once, in order, and drops what is malformed", () => {
    expect(
      sanitizePins({ sessions: ["b", 7, "a", "b", ""], projects: "not a list", extra: true }),
    ).toEqual({ sessions: ["b", "a"], projects: [] });
    expect(sanitizePins("nonsense")).toEqual({ sessions: [], projects: [] });
  });
});
