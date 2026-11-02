import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { savedLevel, zoomed, zoomStep } from "./zoom.js";

const key = (key: string, extra: { control?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
  type: "keyDown" as const,
  key,
  control: extra.control ?? true,
  meta: extra.meta ?? false,
  alt: extra.alt ?? false,
});

describe("zoom", () => {
  it("zooms in on the + of any keyboard, out on -, and back with 0", () => {
    expect(zoomStep(key("+"))).toBe(1);
    expect(zoomStep(key("="))).toBe(1);
    expect(zoomStep(key("Add"))).toBe(1);
    expect(zoomStep(key("-"))).toBe(-1);
    expect(zoomStep(key("0"))).toBe(0);
    expect(zoomStep(key("+", { control: false, meta: true }))).toBe(1);
  });

  it("leaves every other key, and AltGr combinations, to the page", () => {
    expect(zoomStep(key("t"))).toBeNull();
    expect(zoomStep(key("+", { control: false }))).toBeNull();
    expect(zoomStep(key("+", { alt: true }))).toBeNull();
    expect(zoomStep({ ...key("+"), type: "keyUp" })).toBeNull();
  });

  it("steps by half a level within bounds, and remembers where it was left", () => {
    expect(zoomed(0, 1)).toBe(0.5);
    expect(zoomed(1.5, -1)).toBe(1);
    expect(zoomed(1.5, 0)).toBe(0);
    expect(zoomed(5, 1)).toBe(5);
    expect(zoomed(-3, -1)).toBe(-3);

    const directory = mkdtempSync(join(tmpdir(), "zoom-"));
    const file = join(directory, "zoom.json");
    expect(savedLevel(file)).toBe(0);
    writeFileSync(file, JSON.stringify({ level: 1.5 }));
    expect(savedLevel(file)).toBe(1.5);
    writeFileSync(file, JSON.stringify({ level: 40 }));
    expect(savedLevel(file)).toBe(5);
    writeFileSync(file, "garbled");
    expect(savedLevel(file)).toBe(0);
  });
});
