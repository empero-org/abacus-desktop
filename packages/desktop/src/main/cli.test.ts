import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { candidates, compareVersions, parseVersion } from "./cli.js";

describe("CLI detection", () => {
  it("reads the version abacus prints", () => {
    expect(parseVersion("abacus 0.6.5\n")).toBe("0.6.5");
    expect(parseVersion("command not found")).toBeNull();
  });

  it("orders versions numerically, not as text", () => {
    expect(compareVersions("0.6.10", "0.6.5")).toBeGreaterThan(0);
    expect(compareVersions("0.6.5", "0.6.5")).toBe(0);
    expect(compareVersions("0.5.9", "0.6.0")).toBeLessThan(0);
  });

  it("tries ABACUS_BIN before the install locations", () => {
    const list = candidates({ ABACUS_BIN: "/custom/abacus", PATH: "" }, "/home/me");
    expect(list[0]).toBe("/custom/abacus");
    expect(list).toContain(
      join("/home/me", ".local", "bin", process.platform === "win32" ? "abacus.exe" : "abacus"),
    );
  });
});
