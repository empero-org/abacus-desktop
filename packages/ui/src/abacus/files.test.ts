import { describe, expect, it } from "vitest";
import { clockTime, fileKind, fileSize, previewText, typeLabel } from "./files.js";

describe("a shown file", () => {
  it("is drawn by what it is", () => {
    expect(
      ["PiVo-report.pdf", "take.WAV", "chart.png", "clip.webm", "data.json", "notes", "a.bin"].map(
        fileKind,
      ),
    ).toEqual(["pdf", "audio", "image", "video", "text", "other", "other"]);
  });

  it("names its type in a word", () => {
    expect(["report.pdf", "notes.txt", "README.md", "take.wav", "Makefile"].map(typeLabel)).toEqual(
      ["PDF", "Text", "Markdown", "WAV", "File"],
    );
  });

  it("gives its size and playing time", () => {
    expect([820, 14_336, 3_355_443, 5 * 1024 ** 3].map(fileSize)).toEqual([
      "820 B",
      "14 KB",
      "3.2 MB",
      "5 GB",
    ]);
    expect([7.9, 750, 3723, Number.NaN].map(clockTime)).toEqual([
      "0:07",
      "12:30",
      "1:02:03",
      "0:00",
    ]);
  });

  it("lays JSON out to be read, unless only its start was read", () => {
    expect(previewText("a.json", '{"a":[1,2]}', false)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(previewText("a.json", '{"a":[1,', true)).toBe('{"a":[1,');
    expect(previewText("a.txt", '{"a":1}', false)).toBe('{"a":1}');
  });
});
