// One transcript item: the person's message (or another session's, or a
// subagent's), the agent's answer, its reasoning, or a tool call. Tool calls
// stay one quiet line until opened.

import { memo, useEffect, useState } from "react";
import {
  BanIcon,
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  CopyIcon,
  FilePenIcon,
  GitBranchIcon,
  FileTextIcon,
  LoaderIcon,
  SquareTerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog.js";
import { cn } from "@/components/lib/utils.js";
import { useAbacus } from "../context.js";
import type { Item, MessageSender, ToolItemType, ToolStatus } from "../protocol.js";
import { compactionLabel } from "../format.js";
import { standsAlone, toolSubject, toolVerb } from "../tools.js";
import { Markdown } from "./Markdown.js";

type ToolItem = Extract<Item, { status: ToolStatus }>;

export const ItemView = memo(function ItemView({ item, live }: { item: Item; live: boolean }) {
  switch (item.type) {
    case "userMessage":
      if (item.report && item.from) return <SubagentReport text={item.text} from={item.from} />;
      return item.from ? (
        <PeerMessage text={item.text} from={item.from} />
      ) : (
        <UserMessage text={item.text} images={item.images ?? []} files={item.files ?? []} />
      );
    case "agentMessage":
      return <AgentMessage text={item.text} streaming={live} />;
    case "reasoning":
      return <Reasoning text={item.text} streaming={live} />;
    case "contextCompaction":
      return <Compacted label={compactionLabel(item)} />;
    case "commandOutput":
      return <CommandOutput command={item.command} text={item.text} />;
    default:
      return <ToolCall item={item} />;
  }
});

/** Where the context was summarised: while the person was away, or earlier in a reopened thread. */
function Compacted({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-ui-sm text-foreground-subtlest" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** What a command such as `/memory` or `/usage` said: the window's, not the model's. */
function CommandOutput({ command, text }: { command: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3">
      <span className="flex items-center gap-1.5 text-ui-sm text-foreground-subtle">
        <SquareTerminalIcon className="size-3.5 shrink-0" />
        <span className="font-mono">/{command}</span>
      </span>
      <pre className="overflow-x-auto font-mono text-ui-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {text}
      </pre>
    </div>
  );
}

/**
 * A message another session's agent, or a subagent, sent this one. It is not
 * the person's, so it sits on the agent's side, labelled with who wrote it.
 */
function PeerMessage({ text, from }: { text: string; from: MessageSender }) {
  const Icon = from.agent ? BotIcon : GitBranchIcon;
  return (
    <div className="flex max-w-[85%] flex-col gap-1.5 rounded-xl border border-dashed px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-ui-sm text-foreground-subtle">
        <Icon className="size-3.5 shrink-0 text-brand" />
        <span className="shrink-0">Message from</span>
        <span className="truncate font-medium text-foreground" title={from.session ?? undefined}>
          {from.title}
        </span>
      </div>
      <div className="text-ui-base leading-relaxed whitespace-pre-wrap break-words">{text}</div>
    </div>
  );
}

/**
 * What background subagents reported. It reaches the agent as a prompt; the
 * person sees who reported, and opens it for the details.
 */
function SubagentReport({ text, from }: { text: string; from: MessageSender }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="max-w-[85%] rounded-xl border border-dashed px-4 py-2.5"
    >
      <CollapsibleTrigger className="group/report flex w-full min-w-0 items-center gap-1.5 text-left text-ui-sm text-foreground-subtle hover:text-foreground">
        <BotIcon className="size-3.5 shrink-0 text-brand" />
        <span className="shrink-0">Report from</span>
        <span className="truncate font-medium text-foreground">{from.title}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]/report:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Markdown className="mt-2 text-ui-sm leading-relaxed [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-ui-base [&_h2]:font-medium">
          {text}
        </Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UserMessage({ text, images, files }: { text: string; images: string[]; files: string[] }) {
  return (
    <div className="flex flex-col items-end gap-2">
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
      {text.trim() ? (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-card px-4 py-2.5 text-ui-base leading-relaxed whitespace-pre-wrap break-words shadow-[inset_0_0_0_1px_var(--color-border)]">
          {text}
        </div>
      ) : null}
    </div>
  );
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

function AgentMessage({ text, streaming }: { text: string; streaming: boolean }) {
  if (!text.trim()) return null;

  return (
    <div className="group/agent flex flex-col gap-1">
      <Markdown streaming={streaming}>{text}</Markdown>
      {!streaming ? <CopyButton text={text} /> : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex opacity-0 transition-opacity group-hover/agent:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ui-sm text-foreground-subtlest hover:bg-hover hover:text-foreground"
        aria-label="Copy message"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming);
  // Open while it streams, fold away once the agent moves on.
  useEffect(() => setOpen(streaming), [streaming]);
  if (!text.trim() && !streaming) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/reasoning flex items-center gap-1.5 text-ui-base text-foreground-subtle hover:text-foreground">
        {streaming ? (
          <Shimmer as="span" duration={1.6}>
            Thinking
          </Shimmer>
        ) : (
          <span>Thought</span>
        )}
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]/reasoning:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border-l-2 border-brand/30 pl-3 text-foreground-subtle">
          <Markdown streaming={streaming} className="text-ui-sm leading-relaxed">
            {text}
          </Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const ICONS: Record<ToolItemType, typeof WrenchIcon> = {
  commandExecution: SquareTerminalIcon,
  fileChange: FilePenIcon,
  functionCall: WrenchIcon,
};

function ToolCall({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[item.type];
  const subject = toolSubject(item.name, item.command);
  // What the agent said the call is for reads in place of the verb, with the
  // command or pattern beside it, quieter.
  const description = item.description?.trim();
  const output = item.output?.trimEnd();
  const pending = useAbacus((state) =>
    state.thread?.pending.some(
      (request) => request.kind === "approval" && request.params.itemId === item.id,
    ),
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="-my-2">
      <CollapsibleTrigger
        disabled={!output}
        className="group/tool flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-ui-base text-foreground-subtle enabled:hover:text-foreground"
      >
        <Icon className="size-4 shrink-0 text-foreground-subtlest" />
        {description ? (
          <>
            <span className="max-w-[75%] shrink-0 truncate">{description}</span>
            {subject ? (
              <code className="min-w-0 truncate font-mono text-ui-sm text-foreground-subtlest">
                {subject}
              </code>
            ) : null}
          </>
        ) : (
          <>
            <span className="shrink-0">{toolVerb(item.name, item.type, item.status)}</span>
            {/* Resumed history carries no call summary; the tool's name stands in. */}
            {subject || !standsAlone(item.name) ? (
              <code
                className={cn(
                  "min-w-0 truncate font-mono text-ui-sm",
                  subject ? "text-foreground" : "text-foreground-subtlest",
                )}
              >
                {subject || item.name}
              </code>
            ) : null}
          </>
        )}
        <StatusMark status={item.status} waiting={Boolean(pending)} />
        {output ? (
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-0 transition-transform group-hover/tool:opacity-100 group-data-[state=open]/tool:rotate-90 group-data-[state=open]/tool:opacity-100" />
        ) : null}
      </CollapsibleTrigger>
      {/* What a send_message call said stays in view, as a received one does. */}
      {item.message ? (
        <p className="mt-0.5 mb-2 ml-6 border-l-2 border-brand/30 pl-3 text-ui-sm leading-relaxed whitespace-pre-wrap break-words text-foreground-subtle">
          {item.message}
        </p>
      ) : null}
      {output ? (
        <CollapsibleContent>
          <pre className="mt-1.5 mb-2 max-h-80 overflow-auto rounded-lg border bg-terminal-bg px-3 py-2.5 font-mono text-ui-sm leading-relaxed whitespace-pre-wrap break-words text-terminal-fg">
            {output}
          </pre>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function StatusMark({ status, waiting }: { status: ToolStatus; waiting: boolean }) {
  const className = "size-3.5 shrink-0";
  if (status === "inProgress")
    return <LoaderIcon className={cn(className, "animate-spin text-brand")} aria-label="Running" />;
  if (status === "awaitingApproval")
    return (
      <CircleDashedIcon
        className={cn(
          className,
          waiting ? "animate-pulse text-warning" : "text-foreground-subtlest",
        )}
        aria-label="Waiting for approval"
      />
    );
  if (status === "aborted")
    return <XIcon className={cn(className, "text-destructive")} aria-label="Stopped" />;
  if (status === "declined")
    return <BanIcon className={cn(className, "text-foreground-subtlest")} aria-label="Not run" />;
  return null;
}
