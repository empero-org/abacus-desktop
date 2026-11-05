import { describe, expect, it } from "vitest";
import { enterAction } from "./composerKeys.js";

const key = (
  key: string,
  held: Partial<Record<"shiftKey" | "ctrlKey" | "altKey", boolean>> = {},
) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  isComposing: false,
  ...held,
});

describe("enterAction", () => {
  it("sends on Enter alone", () => {
    expect(enterAction(key("Enter"))).toBe("send");
  });

  it("starts a new line on Shift, Ctrl or Alt with Enter", () => {
    expect(enterAction(key("Enter", { shiftKey: true }))).toBe("newline");
    expect(enterAction(key("Enter", { ctrlKey: true }))).toBe("newline");
    expect(enterAction(key("Enter", { altKey: true }))).toBe("newline");
    expect(enterAction(key("Enter", { ctrlKey: true, shiftKey: true }))).toBe("newline");
  });

  it("leaves other keys, and Enter that confirms an input method, alone", () => {
    expect(enterAction(key("a", { ctrlKey: true }))).toBeNull();
    expect(enterAction({ ...key("Enter"), isComposing: true })).toBeNull();
  });
});
