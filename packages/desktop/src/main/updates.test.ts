import { describe, expect, it } from "vitest";
import { tagVersion } from "./updates.js";

describe("updates", () => {
  it("reads the version a releases/latest redirect names", () => {
    expect(tagVersion("https://github.com/empero-org/abacus/releases/tag/v0.7.5")).toBe("0.7.5");
    expect(tagVersion("https://github.com/empero-org/abacus-desktop/releases/tag/0.1.5/")).toBe(
      "0.1.5",
    );
    // No release yet: GitHub sends you to the list instead.
    expect(tagVersion("https://github.com/empero-org/abacus/releases")).toBeNull();
    expect(tagVersion(null)).toBeNull();
  });
});
