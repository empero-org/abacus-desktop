// The working tree's changes, as git reports them: the file list the last turn
// announced, and the diff read fresh whenever the pane opens or a turn ends.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronRightIcon, FolderOpenIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import { parseUnifiedDiff, type DiffFile } from "../diff.js";

export function ChangesPane({ onClose }: { onClose: () => void }) {
  const workspace = useAbacus((state) => state.workspace?.workspace);
  const turnId = useAbacus((state) => state.thread?.turnId ?? null);
  const changedCount = useAbacus((state) => state.thread?.changedFiles.length ?? 0);
  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!window.abacus) return;
    setLoading(true);
    try {
      const { diff } = await window.abacus.request<{ diff: string }>("thread/diff/read");
      setFiles(parseUnifiedDiff(diff));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the pane opens, when a turn ends, and when the file list moves.
  useEffect(() => {
    if (!turnId) void load();
  }, [load, turnId, changedCount]);

  return (
    <aside className="flex w-[min(44vw,560px)] shrink-0 flex-col border-l bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="abacus-label">Changes</span>
        {files ? <span className="text-ui-sm text-foreground-subtlest">{files.length}</span> : null}
        <div className="flex-1" />
        <IconButton label="Refresh" onClick={() => void load()}>
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
        </IconButton>
        {workspace ? (
          <IconButton
            label="Show in file manager"
            onClick={() => void window.abacus?.revealPath(workspace)}
          >
            <FolderOpenIcon className="size-3.5" />
          </IconButton>
        ) : null}
        <IconButton label="Close" onClick={onClose}>
          <XIcon className="size-3.5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-ui-sm text-destructive">{error}</p>
        ) : files && files.length === 0 ? (
          <p className="p-4 text-ui-sm text-foreground-subtlest">
            No unstaged changes. New files git does not track yet are not shown here.
          </p>
        ) : (
          files?.map((file) => <FileDiff key={file.path} file={file} />)
        )}
      </div>
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function FileDiff({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(true);
  const slash = file.path.lastIndexOf("/");

  return (
    <section className="border-b">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="sticky top-0 z-10 flex w-full items-center gap-2 bg-panel px-3 py-2 text-left hover:bg-hover"
        aria-expanded={open}
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-foreground-subtlest transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-ui-sm">
          <span className="text-foreground-subtlest">{file.path.slice(0, slash + 1)}</span>
          <span className="text-foreground">{file.path.slice(slash + 1)}</span>
        </span>
        <span className="shrink-0 font-mono text-ui-sm text-diff-added">+{file.added}</span>
        <span className="shrink-0 font-mono text-ui-sm text-diff-removed">−{file.removed}</span>
      </button>
      {open ? (
        file.binary ? (
          <p className="px-4 pb-3 text-ui-sm text-foreground-subtlest">Binary file</p>
        ) : (
          <div className="overflow-x-auto pb-2 font-mono text-[12px] leading-[1.6]">
            <table className="w-full border-collapse">
              <tbody>
                {file.lines.map((line, index) => (
                  <tr
                    key={index}
                    className={cn(
                      line.kind === "add" && "bg-diff-added/10",
                      line.kind === "remove" && "bg-diff-removed/10",
                      line.kind === "hunk" && "text-foreground-subtlest",
                    )}
                  >
                    <td className="w-10 pr-2 text-right align-top text-foreground-subtlest/70 select-none">
                      {line.oldNumber ?? ""}
                    </td>
                    <td className="w-10 pr-2 text-right align-top text-foreground-subtlest/70 select-none">
                      {line.newNumber ?? ""}
                    </td>
                    <td
                      className={cn(
                        "w-4 text-center align-top select-none",
                        line.kind === "add" && "text-diff-added",
                        line.kind === "remove" && "text-diff-removed",
                      )}
                    >
                      {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}
                    </td>
                    <td className="pr-4 whitespace-pre">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
