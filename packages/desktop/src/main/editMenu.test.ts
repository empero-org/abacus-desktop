import { describe, expect, it, vi } from "vitest";
import { editMenuItems } from "./editMenu.js";

const flags = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };
const base = {
  isEditable: false,
  selectionText: "",
  linkURL: "",
  misspelledWord: "",
  dictionarySuggestions: [] as string[],
  editFlags: flags,
} as Parameters<typeof editMenuItems>[0];
const actions = () => ({ replaceMisspelling: vi.fn(), learn: vi.fn(), copyLink: vi.fn() });
const shape = (items: ReturnType<typeof editMenuItems>) =>
  items.map((item) => item.role ?? item.label ?? item.type);

describe("the right-click menu", () => {
  it("edits in a field: cut, copy, paste, select all", () => {
    const items = editMenuItems({ ...base, isEditable: true }, actions());
    expect(shape(items)).toEqual(["cut", "copy", "paste", "separator", "selectAll"]);
  });

  it("copies selected text, and offers nothing over plain text", () => {
    expect(shape(editMenuItems({ ...base, selectionText: "the README" }, actions()))).toEqual([
      "copy",
    ]);
    expect(editMenuItems({ ...base, selectionText: "  " }, actions())).toEqual([]);
  });

  it("copies a link", () => {
    const act = actions();
    const items = editMenuItems({ ...base, linkURL: "https://example.com/a" }, act);
    expect(shape(items)).toEqual(["Copy link"]);
    items[0]?.click?.({} as never, undefined, {} as never);
    expect(act.copyLink).toHaveBeenCalledWith("https://example.com/a");
  });

  it("offers the spell checker's suggestions over a misspelled word", () => {
    const act = actions();
    const items = editMenuItems(
      {
        ...base,
        isEditable: true,
        misspelledWord: "imporer",
        dictionarySuggestions: ["importer", "imported"],
      },
      act,
    );
    expect(shape(items)).toEqual([
      "importer",
      "imported",
      "Add “imporer” to the dictionary",
      "separator",
      "cut",
      "copy",
      "paste",
      "separator",
      "selectAll",
    ]);
    items[0]?.click?.({} as never, undefined, {} as never);
    expect(act.replaceMisspelling).toHaveBeenCalledWith("importer");
  });
});
