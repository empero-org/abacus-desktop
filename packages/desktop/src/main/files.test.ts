import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { byteRange, fileInfo, isShown, presentFiles, readText } from "./files.js";

describe("present_files", () => {
  it("shows the files it finds, and says why it shows none of the others", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "abacus-files-"));
    writeFileSync(join(workspace, "report.pdf"), "%PDF");
    mkdirSync(join(workspace, "out"));
    const answer = await presentFiles(workspace, { paths: ["report.pdf", "out", "gone.txt"] });
    expect(answer.content).toBe(
      [
        "Shown to the person as file cards:",
        `- ${join(workspace, "report.pdf")}`,
        "Could not show out: it is not a file",
        "Could not show gone.txt: no such file",
      ].join("\n"),
    );
    expect(isShown(join(workspace, "report.pdf"))).toBe(true);
    expect(isShown(join(workspace, "gone.txt"))).toBe(false);
    expect((await presentFiles(workspace, { paths: [] })).content).toMatch(/^Error:/);
    expect((await presentFiles(workspace, { paths: ["gone.txt"] })).content).toMatch(/^Error:/);
  });

  it("previews only a shown file, and only text", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "abacus-files-"));
    const text = join(workspace, "a.json");
    const binary = join(workspace, "a.bin");
    writeFileSync(text, '{"a":1}');
    writeFileSync(binary, Buffer.from([1, 0, 2]));
    expect(await readText(text)).toBeNull();
    const info = await fileInfo([text, binary, join(workspace, "gone"), "relative"]);
    expect(info.map((file) => [file.name, file.size])).toEqual([
      ["a.json", 7],
      ["a.bin", 3],
      ["gone", null],
    ]);
    expect(await readText(text)).toEqual({ text: '{"a":1}', truncated: false });
    expect(await readText(binary)).toBeNull();
  });
});

describe("byteRange", () => {
  it("reads what audio and video ask for", () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange("bytes=0-", 100)).toEqual([0, 99]);
    expect(byteRange("bytes=10-19", 100)).toEqual([10, 19]);
    expect(byteRange("bytes=90-200", 100)).toEqual([90, 99]);
    expect(byteRange("bytes=-10", 100)).toEqual([90, 99]);
    expect(byteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(byteRange("items=0-1", 100)).toBeNull();
  });
});
