// A unified diff (`git diff` output) split into files and lines, enough to
// render it; not a general patch parser.

export interface DiffLine {
  kind: "add" | "remove" | "context" | "hunk" | "meta";
  text: string;
  /** Line numbers in the old and new file, where the line has one. */
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  binary: boolean;
  lines: DiffLine[];
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // `diff --git a/x b/x`: the b-side is the path after the change.
      const path = line.slice("diff --git ".length).split(" b/").pop() ?? "";
      file = { path, added: 0, removed: 0, binary: false, lines: [] };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;

    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      file.lines.push({ kind: "hunk", text: line, oldNumber: null, newNumber: null });
      continue;
    }
    if (!inHunk) {
      if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null"))
        file.path = line.slice(4).replace(/^b\//, "");
      if (line.startsWith("Binary files ")) file.binary = true;
      continue;
    }
    if (line.startsWith("+")) {
      file.added += 1;
      file.lines.push({ kind: "add", text: line.slice(1), oldNumber: null, newNumber: newLine++ });
    } else if (line.startsWith("-")) {
      file.removed += 1;
      file.lines.push({
        kind: "remove",
        text: line.slice(1),
        oldNumber: oldLine++,
        newNumber: null,
      });
    } else if (line.startsWith(" ")) {
      file.lines.push({
        kind: "context",
        text: line.slice(1),
        oldNumber: oldLine++,
        newNumber: newLine++,
      });
    } else if (line.startsWith("\\")) {
      file.lines.push({ kind: "meta", text: line, oldNumber: null, newNumber: null });
    }
  }
  return files;
}
