// The files the agent showed (`present_files`), as cards: each names its
// file and opens it elsewhere, and previews or plays what the window can show
// itself — text and JSON, images, video, and audio with a player of its own.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AppWindowIcon,
  ChevronDownIcon,
  CopyIcon,
  EllipsisIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderOpenIcon,
  GlobeIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import type { ShownFile } from "../bridge.js";
import { clockTime, fileKind, fileSize, previewText, typeLabel, type FileKind } from "../files.js";
import { presentedPaths } from "../steps.js";

const ICONS: Record<FileKind, typeof FileIcon> = {
  pdf: FileTextIcon,
  image: FileImageIcon,
  audio: FileAudioIcon,
  video: FileVideoIcon,
  text: FileTextIcon,
  other: FileIcon,
};

const basename = (path: string) =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);

/** The cards for a `present_files` call, from its answer. */
export function PresentedFiles({ output }: { output: string }) {
  const paths = useMemo(() => presentedPaths(output), [output]);
  // Until the main process has looked at them, the window may not read them.
  const [files, setFiles] = useState<ShownFile[] | null>(null);
  useEffect(() => {
    let current = true;
    void window.abacus?.files.info(paths).then((info) => {
      if (current) setFiles(info);
    });
    return () => {
      current = false;
    };
  }, [paths]);
  const shown = files ?? paths.map((path) => ({ path, name: basename(path), size: null }));

  return (
    <div className="flex flex-col gap-2">
      {shown.map((file) => (
        <FileCard key={file.path} file={file} ready={files !== null} />
      ))}
    </div>
  );
}

function FileCard({ file, ready }: { file: ShownFile; ready: boolean }) {
  const kind = fileKind(file.name);
  const gone = ready && file.size === null;
  const detail = [
    typeLabel(file.name),
    file.size !== null ? fileSize(file.size) : null,
    gone ? "No longer there" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (kind === "audio" && ready && !gone) return <AudioCard file={file} detail={detail} />;
  return <DocumentCard file={file} kind={kind} detail={detail} ready={ready} gone={gone} />;
}

function DocumentCard({
  file,
  kind,
  detail,
  ready,
  gone,
}: {
  file: ShownFile;
  kind: FileKind;
  detail: string;
  ready: boolean;
  gone: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const Icon = ICONS[kind];
  const files = window.abacus?.files;
  // What clicking the card does: a document opens beside the conversation,
  // text unfolds in place, anything else opens in its own app.
  const primary = () => {
    if (kind === "text") setPreviewing((open) => !open);
    else if (kind === "pdf" || kind === "image" || kind === "video") void files?.browse(file.path);
    else void files?.open(file.path);
  };
  const media = ready && !gone && files;

  return (
    <div className="overflow-hidden rounded-xl border bg-panel">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={primary}
          disabled={gone}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
          aria-expanded={kind === "text" ? previewing : undefined}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground-subtle">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-ui-base text-foreground">{file.name}</span>
            <span className="block truncate text-ui-sm text-foreground-subtlest">{detail}</span>
          </span>
        </button>
        <OpenIn path={file.path} kind={kind} disabled={gone}>
          <button
            type="button"
            disabled={gone}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-50"
          >
            Open in
            <ChevronDownIcon className="size-3.5" />
          </button>
        </OpenIn>
      </div>
      {media && kind === "image" ? (
        <button
          type="button"
          onClick={primary}
          className="block w-full border-t bg-background p-2"
          aria-label={`Open ${file.name}`}
        >
          <img
            src={files.url(file.path)}
            alt={file.name}
            className="mx-auto max-h-80 max-w-full rounded-md object-contain"
          />
        </button>
      ) : null}
      {media && kind === "video" ? (
        <video
          src={files.url(file.path)}
          controls
          preload="metadata"
          className="block max-h-96 w-full border-t bg-black"
        />
      ) : null}
      {media && kind === "text" && previewing ? <TextPreview file={file} /> : null}
    </div>
  );
}

function TextPreview({ file }: { file: ShownFile }) {
  const [preview, setPreview] = useState<{ text: string; truncated: boolean } | null | undefined>();
  useEffect(() => {
    let current = true;
    void window.abacus?.files.text(file.path).then(
      (read) => current && setPreview(read),
      () => current && setPreview(null),
    );
    return () => {
      current = false;
    };
  }, [file.path]);
  if (preview === undefined) return null;
  return (
    <div className="border-t">
      {preview === null ? (
        <p className="px-3 py-2.5 text-ui-sm text-foreground-subtlest">
          Not text the window can show; open it instead.
        </p>
      ) : (
        <>
          <pre className="max-h-96 overflow-auto bg-terminal-bg px-3 py-2.5 font-mono text-ui-sm leading-relaxed whitespace-pre-wrap break-words text-terminal-fg">
            {previewText(file.name, preview.text, preview.truncated)}
          </pre>
          {preview.truncated ? (
            <p className="border-t px-3 py-1.5 text-ui-sm text-foreground-subtlest">
              The start of the file; open it to read the rest.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function AudioCard({ file, detail }: { file: ShownFile; detail: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const toggle = () => {
    const player = audio.current;
    if (!player) return;
    if (player.paused) void player.play();
    else player.pause();
  };

  return (
    <div className="rounded-xl border bg-panel px-3 py-2.5">
      <audio
        ref={audio}
        src={window.abacus?.files.url(file.path)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-85"
          aria-label={playing ? `Pause ${file.name}` : `Play ${file.name}`}
        >
          {playing ? (
            <PauseIcon className="size-4" fill="currentColor" />
          ) : (
            <PlayIcon className="ml-0.5 size-4" fill="currentColor" />
          )}
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui-base text-foreground">{file.name}</span>
          <span className="block truncate text-ui-sm text-foreground-subtlest">{detail}</span>
        </span>
        <OpenIn path={file.path} kind="audio">
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
            aria-label={`More for ${file.name}`}
          >
            <EllipsisIcon className="size-4" />
          </button>
        </OpenIn>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={0.01}
          value={position}
          onChange={(event) => {
            const at = Number(event.currentTarget.value);
            if (audio.current) audio.current.currentTime = at;
            setPosition(at);
          }}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
          aria-label={`Position in ${file.name}`}
        />
        <span className="shrink-0 font-mono text-ui-sm text-foreground-subtlest tabular-nums">
          {clockTime(position)} / {clockTime(duration)}
        </span>
      </div>
    </div>
  );
}

/** Where else the file opens: its own app, the window's browser, its folder. */
function OpenIn({
  path,
  kind,
  disabled,
  children,
}: {
  path: string;
  kind: FileKind;
  disabled?: boolean;
  children: ReactNode;
}) {
  const files = window.abacus?.files;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={() => void files?.open(path)}>
          <AppWindowIcon />
          Default app
        </DropdownMenuItem>
        {kind !== "other" ? (
          <DropdownMenuItem onSelect={() => void files?.browse(path)}>
            <GlobeIcon />
            Abacus browser
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void window.abacus?.revealPath(path)}>
          <FolderOpenIcon />
          Show in folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(path)}>
          <CopyIcon />
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
