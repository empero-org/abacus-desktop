import { describe, expect, it } from "vitest";
import type { TokenUsage } from "./protocol.js";
import { usageRows } from "./usage.js";

const usage = (over: Partial<TokenUsage>): TokenUsage => ({
  input: 1_200_000,
  output: 34_000,
  cacheRead: 1_000_000,
  cacheWrite: 0,
  uncachedInput: 200_000,
  cacheRate: 83,
  total: 2_400_000,
  ...over,
});

describe("usageRows", () => {
  it("shows how much input the cache served", () => {
    const rows = usageRows(usage({}), 0);
    expect(rows.map((row) => row.label)).toEqual([
      "Input",
      "Output",
      "Cached",
      "Uncached",
      "All runs",
    ]);
    expect(rows.find((row) => row.label === "Cached")?.value).toContain("83%");
  });

  it("says so when the provider reports no cache figures", () => {
    const rows = usageRows(usage({ cacheRate: null, cacheRead: 0 }), 0);
    expect(rows.find((row) => row.label === "Cache")?.value).toBe("not reported");
  });

  it("lists cache writes only when there are some", () => {
    expect(usageRows(usage({ cacheWrite: 5000 }), 0).some((row) => row.label === "Written")).toBe(
      true,
    );
  });

  it("falls back to the session total without a breakdown", () => {
    expect(usageRows(null, 4200)).toEqual([{ label: "All runs", value: expect.any(String) }]);
  });
});
