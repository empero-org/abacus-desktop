import { describe, expect, it } from "vitest";
import { KeyboardFlags, enterSequence } from "./keyboardProtocol.js";

const enter = (
  held: Partial<Record<"shiftKey" | "altKey" | "ctrlKey" | "metaKey", boolean>> = {},
) => ({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...held,
});

describe("enterSequence", () => {
  it("leaves every key to xterm until a program asks", () => {
    expect(enterSequence(0, enter({ ctrlKey: true }))).toBeNull();
  });

  it("sends a modified Enter as CSI 13 ; modifiers u once asked", () => {
    expect(enterSequence(1, enter({ shiftKey: true }))).toBe("\x1b[13;2u");
    expect(enterSequence(1, enter({ altKey: true }))).toBe("\x1b[13;3u");
    expect(enterSequence(1, enter({ ctrlKey: true }))).toBe("\x1b[13;5u");
    expect(enterSequence(3, enter({ ctrlKey: true, shiftKey: true }))).toBe("\x1b[13;6u");
  });

  it("keeps plain Enter, and other keys, as they were", () => {
    expect(enterSequence(1, enter())).toBeNull();
    expect(enterSequence(1, { ...enter({ ctrlKey: true }), key: "a" })).toBeNull();
  });
});

describe("KeyboardFlags", () => {
  it("pushes and pops what a program asks for", () => {
    const flags = new KeyboardFlags(() => "normal");
    flags.push(3);
    expect(flags.current).toBe(3);
    flags.pop(1);
    expect(flags.current).toBe(0);
    flags.pop(5);
    expect(flags.current).toBe(0);
  });

  it("sets, adds and takes away flags", () => {
    const flags = new KeyboardFlags(() => "normal");
    flags.set(1, 1);
    flags.set(2, 2);
    expect(flags.current).toBe(3);
    flags.set(1, 3);
    expect(flags.current).toBe(2);
  });

  it("keeps a stack per screen, and forgets the alternate one on leaving it", () => {
    let screen: "normal" | "alternate" = "alternate";
    const flags = new KeyboardFlags(() => screen);
    flags.push(1);
    screen = "normal";
    expect(flags.current).toBe(0);
    flags.leftAlternate();
    screen = "alternate";
    expect(flags.current).toBe(0);
  });
});
