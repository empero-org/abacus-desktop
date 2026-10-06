import { describe, expect, it } from "vitest";
import {
  dataUrlBytes,
  fitWithin,
  inputPart,
  isAttachableImage,
  looksLikeText,
} from "./attachments.js";

describe("attachable images", () => {
  it("takes the image types providers accept and nothing else", () => {
    expect(isAttachableImage({ type: "image/png" })).toBe(true);
    expect(isAttachableImage({ type: "image/webp" })).toBe(true);
    expect(isAttachableImage({ type: "image/svg+xml" })).toBe(false);
    expect(isAttachableImage({ type: "application/pdf" })).toBe(false);
  });

  it("scales only what is larger than a model looks at, keeping the aspect", () => {
    expect(fitWithin(1920, 1080)).toBeNull();
    expect(fitWithin(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(fitWithin(1000, 6000, 2000)).toEqual({ width: 333, height: 2000 });
  });

  it("measures a data URL by its decoded size", () => {
    expect(dataUrlBytes("data:image/png;base64,QUJD")).toBe(3);
    expect(dataUrlBytes(`data:image/png;base64,${"A".repeat(4000)}`)).toBe(3000);
  });
});

describe("attached files", () => {
  it("tells text from binary by the bytes", () => {
    expect(looksLikeText(new TextEncoder().encode("fn main() {}\n"))).toBe(true);
    expect(looksLikeText(new Uint8Array([0x89, 0x50, 0x00, 0x47]))).toBe(false);
  });

  it("sends each kind as the input part the app server takes", () => {
    expect(
      inputPart({ id: "a", kind: "image", name: "shot.png", url: "data:image/png;base64,QUJD" }),
    ).toEqual({
      type: "image",
      url: "data:image/png;base64,QUJD",
    });
    expect(inputPart({ id: "b", kind: "file", name: "notes.md", path: "/work/notes.md" })).toEqual({
      type: "localFile",
      path: "/work/notes.md",
    });
    expect(inputPart({ id: "c", kind: "file", name: "Pasted text", text: "hi" })).toEqual({
      type: "file",
      name: "Pasted text",
      text: "hi",
    });
  });
});
