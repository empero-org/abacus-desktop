import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceFromArgv } from "./argv.js";

describe("workspaceFromArgv", () => {
  const root = mkdtempSync(join(tmpdir(), "abacus-argv-"));
  writeFileSync(join(root, "file.txt"), "");

  it("takes the first argument that is a folder, past flags and files", () => {
    const argv = ["/opt/Abacus/abacus", "--remote-debugging-port=9333", "file.txt", "."];
    expect(workspaceFromArgv(argv, root, true)).toBe(root);
  });

  it("skips the main script when unpackaged", () => {
    expect(workspaceFromArgv(["electron", root], "/", false)).toBeUndefined();
    expect(workspaceFromArgv(["electron", ".", root], "/", false)).toBe(root);
  });

  it("returns nothing for a path that does not exist", () => {
    expect(workspaceFromArgv(["abacus", join(root, "missing")], root, true)).toBeUndefined();
  });
});
