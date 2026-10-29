// Whether newer releases are out, for the sidebar's "Update available": the
// newest release of this app and of the CLI, read from where GitHub's
// releases/latest page redirects, which has no hourly API allowance to run out
// of. Installing stays with `abacus update` (see the About section).

import type { UpdateStatus, UpdateTarget } from "@abacus/ui/bridge";
import { compareVersions } from "./cli.js";

const RELEASES = "https://github.com/empero-org";

/** The version a releases/latest redirect names: `…/releases/tag/v0.1.5` is 0.1.5. */
export function tagVersion(location: string | null): string | null {
  return location?.match(/\/releases\/tag\/v?(\d+(?:\.\d+)*)\/?$/)?.[1] ?? null;
}

async function latestRelease(repo: string): Promise<string | null> {
  try {
    const response = await fetch(`${RELEASES}/${repo}/releases/latest`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return tagVersion(response.headers.get("location"));
  } catch {
    // Offline or blocked: nothing to offer, and nothing worth saying.
    return null;
  }
}

/** What is newer than `desktop` and `cli` (null when the CLI is not installed). */
export async function checkUpdates(desktop: string, cli: string | null): Promise<UpdateStatus> {
  const [desktopLatest, cliLatest] = await Promise.all([
    latestRelease("abacus-desktop"),
    cli ? latestRelease("abacus") : null,
  ]);
  const newer = (current: string, latest: string | null): UpdateTarget | null =>
    latest && compareVersions(latest, current) > 0 ? { current, latest } : null;
  return { desktop: newer(desktop, desktopLatest), cli: cli ? newer(cli, cliLatest) : null };
}
