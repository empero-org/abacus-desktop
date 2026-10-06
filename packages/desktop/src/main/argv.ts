// Reading a project folder off the command line: `abacus-desktop ~/project`.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/** The first argument that names an existing folder, resolved against `cwd`. */
export function workspaceFromArgv(
  argv: string[],
  cwd: string,
  packaged: boolean,
): string | undefined {
  // Packaged: [exe, ...args]. Unpackaged: [electron, main script, ...args].
  for (const arg of argv.slice(packaged ? 1 : 2)) {
    if (arg.startsWith("-")) continue;
    const path = resolve(cwd, arg);
    if (existsSync(path) && statSync(path).isDirectory()) return path;
  }
  return undefined;
}
