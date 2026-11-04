// What a turn changed through the file tools, where it ended: each file with
// the lines it gained and lost, the turn's own diff, and a way to take it all
// back while nothing has changed those files since.

import { useEffect, useState } from "react";
import { FileDiffIcon, Undo2Icon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useAbacus } from "../context.js";
import type { FileEdit, Item } from "../protocol.js";

type Edits = Extract<Item, { type: "fileEdits" }>;

/** How long "Undo" waits for the second click that confirms it. */
const CONFIRM_MS = 4000;

export function TurnEdits({ item }: { item: Edits }) {
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const showChanges = useAbacus((state) => state.showChanges);
  const undoEdits = useAbacus((state) => state.undoEdits);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const added = item.files.reduce((sum, file) => sum + file.added, 0);
  const removed = item.files.reduce((sum, file) => sum + file.removed, 0);
  const count = `${item.files.length} ${item.files.length === 1 ? "file" : "files"}`;
  const undo = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setUndoing(true);
    await undoEdits(item.checkpoint);
    setUndoing(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        {/* Wide enough to read: in a narrow pane the buttons go below instead. */}
        <span className="flex min-w-0 flex-1 basis-44 items-baseline gap-2">
          <span className="truncate text-ui-base text-foreground">
            {item.undone ? "Edits undone" : `Edited ${count}`}
          </span>
          {item.undone ? null : (
            <span className="shrink-0 font-mono text-ui-sm">
              <span className="text-diff-added">+{added}</span>{" "}
              <span className="text-diff-removed">−{removed}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {item.undone ? null : (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={working || undoing}
              title={working ? "Wait for the turn to end" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-sm hover:bg-hover disabled:opacity-50",
                confirming
                  ? "text-destructive hover:text-destructive"
                  : "text-foreground-subtle hover:text-foreground",
              )}
            >
              {confirming ? "Undo these edits?" : "Undo"}
              <Undo2Icon className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => showChanges(item.checkpoint)}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground"
          >
            <FileDiffIcon className="size-3.5" />
            View changes
          </button>
        </span>
      </div>
      <ul className="border-t py-1">
        {item.files.map((file) => (
          <EditedFile key={file.path} file={file} undone={Boolean(item.undone)} />
        ))}
      </ul>
    </div>
  );
}

function EditedFile({ file, undone }: { file: FileEdit; undone: boolean }) {
  const slash = file.path.lastIndexOf("/");
  const note = file.status === "added" ? "new" : file.status === "deleted" ? "deleted" : null;
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-3 py-0.5 font-mono text-ui-sm",
        undone && "line-through opacity-60",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground-subtlest">{file.path.slice(0, slash + 1)}</span>
        <span className="text-foreground">{file.path.slice(slash + 1)}</span>
        {note ? <span className="ml-2 font-sans text-foreground-subtlest">{note}</span> : null}
      </span>
      {file.binary ? (
        <span className="shrink-0 font-sans text-foreground-subtlest">binary</span>
      ) : (
        <>
          <span className="shrink-0 text-diff-added">+{file.added}</span>
          <span className="shrink-0 text-diff-removed">−{file.removed}</span>
        </>
      )}
    </li>
  );
}
