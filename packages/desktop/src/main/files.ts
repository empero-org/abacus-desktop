// Files the agent shows the person. `present_files` puts them in the
// transcript as cards, which open, preview and play them. The window reads
// them through `abacus-file:`, which serves only the files a card shows, and
// only to the window: the browser's pages live in a session of their own.

import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { ipcMain, protocol, shell, type Session, type WebContents } from "electron";
import type { Browser } from "./browser.js";
import type { ToolAnswer } from "./browserTools.js";

const FILE_SCHEME = "abacus-file";

/** The most files one call shows. */
const MAX_FILES = 20;
/** The most of a text file a preview reads. */
const PREVIEW_BYTES = 256 * 1024;

/** The tool definition, as `tools/register` takes it. */
export const PRESENT_TOOL = {
  name: "present_files",
  description:
    "Show files to the person in the Abacus desktop app, as cards under your message that open, preview and play them: documents (PDF, text, Markdown, JSON, CSV), images, audio and video. Use it for files the person should look at — a report you wrote, a chart, a recording — rather than only naming their paths. Paths are relative to the workspace, or absolute.",
  needsApproval: false,
  parameters: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: MAX_FILES,
        description: "The files to show, in the order to show them.",
      },
    },
    required: ["paths"],
  },
} as const;

/** What a card may read: the files cards show, and only those. */
const shown = new Set<string>();

/** The line the window reads a card's file from; the model reads it too. */
const SHOWN = "Shown to the person as file cards:";

/** Show `args.paths`, from `workspace`: the tool's answer lists each file shown, and why any was not. */
export async function presentFiles(
  workspace: string,
  args: Record<string, unknown>,
): Promise<ToolAnswer> {
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((path): path is string => typeof path === "string" && path.trim() !== "")
    : [];
  if (paths.length === 0) return { content: "Error: give the paths of the files to show" };
  const lines: string[] = [];
  const problems: string[] = [];
  for (const raw of paths.slice(0, MAX_FILES)) {
    const path = isAbsolute(raw) ? raw : resolve(workspace, raw);
    try {
      if (!(await stat(path)).isFile()) {
        problems.push(`Could not show ${raw}: it is not a file`);
        continue;
      }
      shown.add(path);
      lines.push(`- ${path}`);
    } catch {
      problems.push(`Could not show ${raw}: no such file`);
    }
  }
  if (lines.length === 0) return { content: `Error: ${problems.join("\n")}` };
  return { content: [SHOWN, ...lines, ...problems].join("\n") };
}

export interface FileInfo {
  path: string;
  name: string;
  /** Bytes; null when the file is gone. */
  size: number | null;
}

/** What each card shows of its file; asking lets the window read it. */
export async function fileInfo(paths: unknown): Promise<FileInfo[]> {
  if (!Array.isArray(paths)) return [];
  return Promise.all(
    paths
      .filter((path): path is string => typeof path === "string" && isAbsolute(path))
      .map(async (path) => {
        shown.add(path);
        const size = await stat(path).then(
          (info) => (info.isFile() ? info.size : null),
          () => null,
        );
        return { path, name: basename(path), size };
      }),
  );
}

/** Whether a card shows `path`, so the window may open or read it. */
export function isShown(path: unknown): path is string {
  return typeof path === "string" && shown.has(path);
}

/** The start of a shown text file, for its card's preview; null for one that is not text. */
export async function readText(
  path: unknown,
): Promise<{ text: string; truncated: boolean } | null> {
  if (!isShown(path)) return null;
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const buffer = Buffer.alloc(Math.min(size, PREVIEW_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.subarray(0, 8192).includes(0)) return null;
    return { text: bytes.toString("utf8"), truncated: size > bytesRead };
  } finally {
    await file.close();
  }
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
};

/** Answer the window about the files its cards show: what each is, its text, and opening it. */
export function answerFileRequests(browserFor: (contents: WebContents) => Browser): void {
  ipcMain.handle("files:info", (_event, paths: unknown) => fileInfo(paths));
  ipcMain.handle("files:text", (_event, path: unknown) => readText(path));
  ipcMain.handle("files:open", async (_event, path: unknown) => {
    if (isShown(path)) await shell.openPath(path);
  });
  ipcMain.handle("files:browse", (event, path: unknown) => {
    if (!isShown(path)) return;
    browserFor(event.sender).open(pathToFileURL(path).href);
    event.sender.send("browser:show");
  });
}

/** Must run before the app is ready. */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ]);
}

/** Serve shown files to the window's pages in `session`, in ranges, so audio and video can seek. */
export function serveFiles(session: Session): void {
  session.protocol.handle(FILE_SCHEME, async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
    if (!isShown(path)) return new Response("Not shown", { status: 403 });
    const size = await stat(path).then(
      (info) => (info.isFile() ? info.size : null),
      () => null,
    );
    if (size === null) return new Response("Not found", { status: 404 });
    const headers: Record<string, string> = {
      "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
    };
    const range = byteRange(request.headers.get("range"), size);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const [start, end] = range ?? [0, size - 1];
    headers["Content-Length"] = String(Math.max(0, end - start + 1));
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    const body =
      size === 0
        ? null
        : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>);
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}

/** The bytes a `Range` header asks for, inclusive; null for the whole file. */
export function byteRange(
  header: string | null,
  size: number,
): [number, number] | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (match[1] === "" && match[2] === "")) return null;
  const [, from, to] = match;
  if (from === "") {
    // The last N bytes.
    const last = Math.min(Number(to), size);
    return last === 0 ? "unsatisfiable" : [size - last, size - 1];
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  return [start, to === "" ? size - 1 : Math.min(Number(to), size - 1)];
}
