import { describe, expect, it } from "vitest";
import { contextRows, shareLabel } from "./contextUse.js";

const use = {
  used: 30_000,
  window: 100_000,
  compactsAt: 80_000,
  estimated: false,
  parts: [
    { key: "system", label: "System prompt", tokens: 2_000 },
    { key: "messages", label: "Messages", tokens: 20_000 },
    { key: "tools", label: "Built-in tools", tokens: 8_000, count: 31 },
  ],
};

describe("contextRows", () => {
  it("lists what fills the context, largest first, then the room left and the buffer", () => {
    expect(contextRows(use).map((row) => [row.key, row.tokens, row.share])).toEqual([
      ["messages", 20_000, 20],
      ["tools", 8_000, 8],
      ["system", 2_000, 2],
      ["free", 50_000, 50],
      ["buffer", 20_000, 20],
    ]);
    expect(contextRows(use)[1]?.count).toBe(31);
  });

  it("past the compaction point, has no free space and less buffer", () => {
    const rows = contextRows({ ...use, used: 90_000 });
    expect(rows.slice(-2).map((row) => [row.key, row.tokens])).toEqual([
      ["free", 0],
      ["buffer", 10_000],
    ]);
  });

  it("without a window, shares are of what is used", () => {
    const rows = contextRows({ ...use, window: null });
    expect(rows.map((row) => row.key)).toEqual(["messages", "tools", "system"]);
    expect(rows[0]?.share).toBeCloseTo(66.67, 1);
  });
});

describe("shareLabel", () => {
  it("keeps tiny shares visible", () => {
    expect([28.64, 0.42, 0.04, 0].map(shareLabel)).toEqual(["28.6%", "0.4%", "<0.1%", "0.0%"]);
  });
});
