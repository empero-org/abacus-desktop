// Where the person writes. Enter sends; while a turn runs, a message waits in a
// queue at the top of the box (QueueBar) and the send button turns into Stop
// when there is nothing to queue. `/` completes commands and `@` files;
// images and text files come in by paste, drop or the attach button. Anything
// the agent is blocked on (an approval, a question) sits above the box, where
// the eye already is.

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentProps,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  Settings2Icon,
  ShieldAlertIcon,
  SquareIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import type { Attachment } from "../attachments.js";
import type { AgentMode, ReasoningEffort } from "../protocol.js";
import { AttachButton, AttachmentStrip } from "./Attachments.js";
import { CompletionList, useCompletion } from "./Completion.js";
import { QueueBar } from "./QueueBar.js";
import { Requests } from "./Requests.js";

export function Composer() {
  const thread = useAbacus((state) => state.thread);
  const draft = useAbacus((state) =>
    state.thread ? (state.drafts[state.thread.threadId] ?? "") : "",
  );
  const setDraft = useAbacus((state) => state.setDraft);
  const send = useAbacus((state) => state.send);
  const interrupt = useAbacus((state) => state.interrupt);
  const attachments = useAbacus((state) =>
    state.thread ? (state.attachments[state.thread.threadId] ?? NONE) : NONE,
  );
  const attach = useAbacus((state) => state.attach);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const running = Boolean(thread?.turnId);
  const blocked = (thread?.pending.length ?? 0) > 0;
  const ready = Boolean(draft.trim()) || attachments.length > 0;
  const threadId = thread?.threadId ?? "";
  const completion = useCompletion(
    textarea,
    draft,
    (text) => setDraft(threadId, text),
    (text) => void send(text),
  );

  // A new or reopened thread puts the cursor where typing starts.
  useEffect(() => {
    textarea.current?.focus();
  }, [thread?.threadId]);

  if (!thread) return null;

  const submit = () => {
    if (!ready || blocked) return;
    void send(draft);
  };

  const take = (files: File[]) => {
    if (files.length > 0) void attach(files);
  };

  // A screenshot or a copied file arrives as a file; text pastes as usual.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    take(files);
  };

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    take([...event.dataTransfer.files]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (completion.onKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape" && running) {
      event.preventDefault();
      void interrupt();
    }
  };

  return (
    <div className="shrink-0 px-6 pb-5">
      <div className="mx-auto flex w-full max-w-(--content-width) flex-col gap-3">
        <Requests />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onDragOver={onDragOver}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            "relative flex flex-col rounded-2xl border bg-card shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)] transition-colors focus-within:border-brand/25",
            blocked && "opacity-60",
            dragging && "border-brand/60 bg-selected",
          )}
        >
          <QueueBar />
          <CompletionList completion={completion} />
          {attachments.length > 0 ? <AttachmentStrip attachments={attachments} /> : null}
          <textarea
            ref={textarea}
            value={draft}
            onChange={(event) => {
              setDraft(thread.threadId, event.target.value);
              completion.onCaret();
            }}
            onSelect={completion.onCaret}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={blocked}
            rows={1}
            placeholder={
              blocked
                ? "Answer the request above first"
                : running
                  ? "Queue a follow-up…"
                  : "Ask abacus anything — / for commands, @ for files"
            }
            className="max-h-[40vh] min-h-[52px] resize-none bg-transparent px-4 pt-3.5 pb-1 text-ui-base leading-relaxed outline-none [field-sizing:content] placeholder:text-foreground-subtlest"
            aria-label="Message"
          />
          <div className="flex items-center gap-1 px-2.5 pt-1 pb-2.5">
            <AttachButton onFiles={take} />
            <ModeMenu />
            <ProfileMenu />
            <EffortMenu />
            <div className="flex-1" />
            {running && !ready ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void interrupt()}
                    className="flex size-8 items-center justify-center rounded-full bg-foreground text-background hover:opacity-85"
                    aria-label="Stop"
                  >
                    <SquareIcon className="size-3 fill-current" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Stop (Esc)</TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="submit"
                disabled={!ready || blocked}
                className="flex size-8 items-center justify-center rounded-full bg-brand text-primary-foreground transition-opacity hover:opacity-85 disabled:bg-foreground/15 disabled:text-foreground-subtlest"
                aria-label={running ? "Queue" : "Send"}
              >
                <ArrowUpIcon className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const NONE: Attachment[] = [];

const MODES: { value: AgentMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "A reviewer model checks anything beyond edits in this project before it runs",
  },
  { value: "yolo", label: "YOLO", hint: "Everything runs without review or asking" },
];

const EFFORTS: { value: ReasoningEffort | null; label: string }[] = [
  { value: null, label: "Default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

function Pill({ children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-ui-sm text-foreground-subtle hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground disabled:opacity-50"
    >
      {children}
      <ChevronDownIcon className="size-3 opacity-60" />
    </button>
  );
}

function ModeMenu() {
  const mode = useAbacus((state) => state.thread?.mode ?? "auto");
  const setMode = useAbacus((state) => state.setMode);
  const current = MODES.find((entry) => entry.value === mode) ?? MODES[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pill title={mode === "yolo" ? "Everything runs without review" : undefined}>
          {mode === "yolo" ? <ShieldAlertIcon className="size-3.5 text-warning" /> : null}
          <span className={cn(mode === "yolo" && "text-warning")}>{current.label}</span>
        </Pill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="abacus-label">Mode</DropdownMenuLabel>
        {MODES.map((entry) => (
          <DropdownMenuItem
            key={entry.value}
            onSelect={() => void setMode(entry.value)}
            className="items-start gap-2.5"
          >
            <CheckIcon className={cn("mt-0.5 size-3.5", entry.value !== mode && "invisible")} />
            <span className="flex flex-col">
              <span>{entry.label}</span>
              <span className="text-ui-sm text-foreground-subtlest">{entry.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  const profile = useAbacus((state) => state.thread?.profile ?? "");
  const model = useAbacus((state) => state.thread?.model ?? "");
  const profiles = useAbacus((state) => state.profiles);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const selectProfile = useAbacus((state) => state.selectProfile);
  const setView = useAbacus((state) => state.setView);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={running}>
        <Pill title={running ? "Change the profile between turns" : model}>
          <span className="max-w-48 truncate">{profile || model || "Profile"}</span>
        </Pill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel className="abacus-label">Profile</DropdownMenuLabel>
        {profiles.map((entry) => (
          <DropdownMenuItem
            key={entry.name}
            onSelect={() => void selectProfile(entry.name)}
            className="items-start gap-2.5"
          >
            <CheckIcon
              className={cn("mt-0.5 size-3.5 shrink-0", entry.name !== profile && "invisible")}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{entry.name}</span>
              {entry.model !== entry.name ? (
                <span className="truncate font-mono text-ui-sm text-foreground-subtlest">
                  {entry.model}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
        {profiles.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => setView("settings")} className="gap-2.5">
          <Settings2Icon className="size-3.5" />
          Profiles and providers…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EffortMenu() {
  const effort = useAbacus((state) => state.thread?.reasoningEffort ?? null);
  const setReasoningEffort = useAbacus((state) => state.setReasoningEffort);
  const current = EFFORTS.find((entry) => entry.value === effort) ?? EFFORTS[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pill>
          <span>{effort ? current.label : "Effort"}</span>
        </Pill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="abacus-label flex items-center gap-3 whitespace-nowrap">
          Reasoning effort
          <DropdownMenuShortcut className="normal-case">Ctrl+T</DropdownMenuShortcut>
        </DropdownMenuLabel>
        {EFFORTS.map((entry, index) => (
          <Fragment key={entry.label}>
            {index === 1 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onSelect={() => void setReasoningEffort(entry.value)}
              className="gap-2.5"
            >
              <CheckIcon className={cn("size-3.5", entry.value !== effort && "invisible")} />
              {entry.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
