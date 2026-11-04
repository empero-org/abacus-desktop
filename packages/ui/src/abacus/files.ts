// What a file the agent showed is, from its name: how its card draws it, and
// the few words under its name.

export type FileKind = "pdf" | "image" | "audio" | "video" | "text" | "other";

const KINDS: Record<string, FileKind> = {
  pdf: "pdf",
  ...Object.fromEntries(
    ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"].map((ext) => [ext, "image"]),
  ),
  ...Object.fromEntries(
    ["mp3", "wav", "ogg", "oga", "opus", "flac", "m4a", "aac"].map((ext) => [ext, "audio"]),
  ),
  ...Object.fromEntries(["mp4", "m4v", "webm", "mov", "ogv"].map((ext) => [ext, "video"])),
  ...Object.fromEntries(
    [
      "txt",
      "md",
      "markdown",
      "json",
      "jsonl",
      "ndjson",
      "csv",
      "tsv",
      "log",
      "yaml",
      "yml",
      "toml",
      "xml",
      "html",
      "htm",
      "css",
      "ini",
      "cfg",
      "conf",
      "env",
      "sql",
      "sh",
      "py",
      "rs",
      "ts",
      "tsx",
      "js",
      "jsx",
      "go",
      "java",
      "c",
      "h",
      "cpp",
      "rb",
      "diff",
      "patch",
    ].map((ext) => [ext, "text"]),
  ),
};

/** Words that read better than the extension in capitals. */
const LABELS: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  markdown: "Markdown",
  log: "Log",
  jpeg: "JPEG",
  yml: "YAML",
};

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileKind(name: string): FileKind {
  return KINDS[extension(name)] ?? "other";
}

/** "PDF", "Markdown", "WAV"; "File" for a name with no extension. */
export function typeLabel(name: string): string {
  const ext = extension(name);
  return LABELS[ext] ?? (ext ? ext.toUpperCase() : "File");
}

/** "820 B", "14 KB", "3.2 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}

/** A playing position: "0:07", "12:30", "1:02:03". */
export function clockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A preview's text: JSON laid out to be read, anything else as it is. */
export function previewText(name: string, text: string, truncated: boolean): string {
  const ext = extension(name);
  if (!truncated && (ext === "json" || ext === "geojson")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}
