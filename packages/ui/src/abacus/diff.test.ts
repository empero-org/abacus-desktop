import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./diff.js";

const DIFF = `diff --git a/src/lib.rs b/src/lib.rs
index 1111111..2222222 100644
--- a/src/lib.rs
+++ b/src/lib.rs
@@ -1,3 +1,4 @@
 fn main() {
-    println!("old");
+    println!("new");
+    println!("more");
 }
\\ No newline at end of file
diff --git a/logo.png b/logo.png
index 3333333..4444444 100644
Binary files a/logo.png and b/logo.png differ
`;

describe("parseUnifiedDiff", () => {
  const files = parseUnifiedDiff(DIFF);

  it("splits the diff into files", () => {
    expect(files.map((file) => file.path)).toEqual(["src/lib.rs", "logo.png"]);
  });

  it("counts and numbers changed lines", () => {
    const [lib] = files;
    expect(lib).toMatchObject({ added: 2, removed: 1, binary: false });
    const kinds = lib!.lines.map((line) => line.kind);
    expect(kinds).toEqual(["hunk", "context", "remove", "add", "add", "context", "meta"]);
    expect(lib!.lines[2]).toMatchObject({
      text: '    println!("old");',
      oldNumber: 2,
      newNumber: null,
    });
    expect(lib!.lines[4]).toMatchObject({
      text: '    println!("more");',
      oldNumber: null,
      newNumber: 3,
    });
    expect(lib!.lines[5]).toMatchObject({ oldNumber: 3, newNumber: 4 });
  });

  it("marks binary files", () => {
    expect(files[1]).toMatchObject({ binary: true, lines: [] });
  });

  it("returns nothing for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
