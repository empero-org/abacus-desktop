// What waits above the prompt: image thumbnails and file chips, each
// removable, and the button that picks more.

import { useRef } from "react";
import { FileTextIcon, PaperclipIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { Attachment } from "../attachments.js";
import { useAbacus } from "../context.js";

export function AttachmentStrip({ attachments }: { attachments: Attachment[] }) {
  const detach = useAbacus((state) => state.detach);
  return (
    <ul className="flex flex-wrap items-end gap-2 px-3 pt-3" aria-label="Attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="group/thumb relative">
          {attachment.kind === "image" ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              title={attachment.name}
              className="size-16 rounded-lg border object-cover"
            />
          ) : (
            <span
              className="flex h-9 max-w-56 items-center gap-2 rounded-lg border bg-background px-2.5 text-ui-sm"
              title={"path" in attachment ? attachment.path : attachment.name}
            >
              <FileTextIcon className="size-3.5 shrink-0 text-brand" />
              <span className="truncate">{attachment.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => detach(attachment.id)}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-popover text-foreground-subtle opacity-0 shadow-sm group-hover/thumb:opacity-100 hover:text-foreground focus-visible:opacity-100"
            aria-label={`Remove ${attachment.name}`}
          >
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const supported = useAbacus((state) =>
    Boolean(state.capabilities.imageInput || state.capabilities.fileInput),
  );
  const input = useRef<HTMLInputElement>(null);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows hover; the span keeps the tooltip reachable. */}
        <span>
          <button
            type="button"
            disabled={!supported}
            onClick={() => input.current?.click()}
            className="flex size-7 items-center justify-center rounded-full text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-40"
            aria-label="Attach files"
          >
            <PaperclipIcon className="size-4" />
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              onFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {supported
          ? "Attach images or text files (or paste or drop them)"
          : "Update abacus to attach files"}
      </TooltipContent>
    </Tooltip>
  );
}
