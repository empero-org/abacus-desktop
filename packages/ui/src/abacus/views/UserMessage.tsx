// The person's own message: what they attached, what they wrote, and under it,
// on hover, when it was sent and what can be done with it: copy it, rewind the
// conversation to before it, or fork a new session from there. Rewinding and
// forking put the message back in the composer to edit and send again.

import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, FileTextIcon, RotateCcwIcon, SplitIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import { relativeTime } from "../format.js";
import type { Item } from "../protocol.js";

type Message = Extract<Item, { type: "userMessage" }>;

/** How long "Rewind" waits for the second click that confirms it. */
const CONFIRM_MS = 4000;

/** `back`: how far back the message is, when the conversation can go back to it. */
export function UserMessage({ item, back }: { item: Message; back: number | undefined }) {
  const images = item.images ?? [];
  const files = item.files ?? [];
  return (
    <div className="group/user flex flex-col items-end gap-2">
      {files.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {files.map((path) => (
            <span
              key={path}
              title={path}
              className="flex max-w-72 items-center gap-1.5 rounded-lg border bg-card px-2 py-1 font-mono text-ui-xs text-foreground-subtle"
            >
              <FileTextIcon className="size-3 shrink-0 text-brand" />
              <span className="truncate">{path}</span>
            </span>
          ))}
        </div>
      ) : null}
      {images.length > 0 ? (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {images.map((url, index) => (
            <ImagePreview key={index} url={url} label={`Image ${index + 1}`} />
          ))}
        </div>
      ) : null}
      {item.text.trim() ? (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-card px-4 py-2.5 text-ui-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] shadow-[inset_0_0_0_1px_var(--color-border)]">
          {item.text}
        </div>
      ) : null}
      <MessageActions item={item} back={back} />
    </div>
  );
}

function MessageActions({ item, back }: { item: Message; back: number | undefined }) {
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const canRewind = useAbacus((state) => Boolean(state.capabilities.rewind));
  const rewindTo = useAbacus((state) => state.rewindTo);
  const forkFrom = useAbacus((state) => state.forkFrom);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const offered = canRewind && back !== undefined;
  const go = async (to: typeof rewindTo) => {
    if (back === undefined) return;
    setConfirming(false);
    setGoing(true);
    const went = await to(item, back);
    setGoing(false);
    if (went) focusComposer();
  };
  const rewind = () => {
    if (confirming) void go(rewindTo);
    else setConfirming(true);
  };
  const busy = working ? "Wait for the turn to end" : null;

  return (
    <div
      className={cn(
        "-mt-1 flex items-center gap-0.5 text-ui-sm text-foreground-subtlest transition-opacity group-hover/user:opacity-100 focus-within:opacity-100",
        confirming || going ? "opacity-100" : "opacity-0",
      )}
    >
      {item.at ? (
        <>
          <Ago at={item.at} />
          <span aria-hidden className="px-1">
            ·
          </span>
        </>
      ) : null}
      <Action
        name={copied ? "Copied" : "Copy"}
        onClick={() => void navigator.clipboard.writeText(item.text).then(() => setCopied(true))}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Action>
      {offered ? (
        <>
          <Action
            name="Rewind to here"
            hint={
              busy ??
              "This message and what came after leave the conversation, and it comes back to edit. Files stay as they are."
            }
            onClick={rewind}
            disabled={working || going}
            danger={confirming}
          >
            {confirming ? <span className="px-0.5">Rewind to here?</span> : null}
            <RotateCcwIcon className="size-3.5" />
          </Action>
          <Action
            name="Fork from here"
            hint={
              busy ?? "A new session up to this message, with it to edit. This one stays as it is."
            }
            onClick={() => void go(forkFrom)}
            disabled={working || going}
          >
            <SplitIcon className="size-3.5 rotate-90" />
          </Action>
        </>
      ) : null}
    </div>
  );
}

/** `hint` says more than the button's `name`, in its tooltip under the name. */
function Action({
  name,
  hint,
  onClick,
  disabled,
  danger,
  children,
}: {
  name: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      {/* A disabled button gets no hover, so its reason shows from around it. */}
      <TooltipTrigger asChild>
        <span className="flex">
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={name}
            className={cn(
              "flex h-6 min-w-6 items-center justify-center gap-1 rounded-md px-1 hover:bg-hover disabled:opacity-50",
              danger ? "text-destructive" : "hover:text-foreground",
            )}
          >
            {children}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex max-w-64 flex-col gap-0.5">
        <span className="font-medium">{name}</span>
        {hint ? <span>{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** When the message was sent, kept current while it shows. */
function Ago({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const iso = new Date(at).toISOString();
  return (
    <time dateTime={iso} title={new Date(at).toLocaleString()} className="px-1">
      {relativeTime(iso, now)}
    </time>
  );
}

/** The message is in the composer now: the cursor goes after it. */
function focusComposer() {
  requestAnimationFrame(() => {
    const composer = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
    if (!composer) return;
    composer.focus();
    composer.setSelectionRange(composer.value.length, composer.value.length);
  });
}

function ImagePreview({ url, label }: { url: string; label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="overflow-hidden rounded-xl border hover:border-border-hover"
          aria-label={`Open ${label}`}
        >
          <img src={url} alt={label} className="max-h-40 max-w-60 object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="w-auto max-w-[min(90vw,1200px)] p-2 sm:max-w-[min(90vw,1200px)]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <img src={url} alt={label} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
