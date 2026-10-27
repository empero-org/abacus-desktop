// Finding the abacus CLI and reading its version.
//
// The desktop app is a front end, not a fork: the agent is always the CLI
// binary on disk, the same one `abacus` runs in a terminal. Updating the
// engine is a CLI update, so the terminal and the window never drift apart.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** The oldest CLI that speaks the app-server protocol this window renders. */
export const MINIMUM_CLI_VERSION = "0.7.1";

const EXE = process.platform === "win32" ? ".exe" : "";

/**
 * Places an abacus install lands, in the order we trust them. An explicit
 * ABACUS_BIN wins outright: that is how you point the app at a debug build.
 */
export function candidates(env: NodeJS.ProcessEnv = process.env, home = homedir()): string[] {
  const list: string[] = [];
  if (env.ABACUS_BIN) list.push(env.ABACUS_BIN);
  list.push(
    join(home, ".local", "bin", `abacus${EXE}`),
    join(home, ".cargo", "bin", `abacus${EXE}`),
  );
  // Not %LOCALAPPDATA%\Programs\abacus on Windows: that is where this app
  // installs itself, as Abacus.exe, and Windows ignores the case.
  if (process.platform !== "win32") {
    list.push("/usr/local/bin/abacus", "/opt/homebrew/bin/abacus", "/usr/bin/abacus");
  }
  // A GUI launched from a desktop environment often gets a thinner PATH than
  // a shell, so PATH is the last resort rather than the first.
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (directory) list.push(join(directory, `abacus${EXE}`));
  }
  return list;
}

export function resolveCli(env: NodeJS.ProcessEnv = process.env): string | null {
  return candidates(env).find((candidate) => existsSync(candidate)) ?? null;
}

/** `abacus --version` prints "abacus 0.6.5"; anything unparseable is no version. */
export function parseVersion(output: string): string | null {
  return output.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function cliVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : parseVersion(String(stdout)));
    });
  });
}

export type CliStatus =
  | { state: "ready"; path: string; version: string }
  | { state: "outdated"; path: string; version: string; minimum: string }
  | { state: "missing" };

export async function detectCli(env: NodeJS.ProcessEnv = process.env): Promise<CliStatus> {
  const path = resolveCli(env);
  if (!path) return { state: "missing" };
  const version = await cliVersion(path);
  if (!version) return { state: "missing" };
  if (compareVersions(version, MINIMUM_CLI_VERSION) < 0) {
    return { state: "outdated", path, version, minimum: MINIMUM_CLI_VERSION };
  }
  return { state: "ready", path, version };
}
