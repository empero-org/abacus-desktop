// The composer's completion popup: `/` commands and their arguments, and
// workspace files after `@`. Arrow keys move, Enter or Tab accept, Escape
// closes; a command with nothing left to type runs as soon as it is chosen.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { FileIcon, SlashIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  EFFORT_OPTIONS,
  MODE_OPTIONS,
  THEME_OPTIONS,
  applySuggestion,
  commandCompletion,
  fileSuggestions,
  mentionAt,
  type CompletionState,
  type Suggestion,
} from "../completion.js";
import { useAbacus } from "../context.js";

export interface Completion {
  state: CompletionState | null;
  selected: number;
  /** Handle a key in the textarea; true when the popup took it. */
  onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean;
  accept(index: number): void;
  /** Track the caret, which decides what is being completed. */
  onCaret(): void;
}

export function useCompletion(
  textarea: RefObject<HTMLTextAreaElement | null>,
  draft: string,
  setText: (text: string) => void,
  run: (text: string) => void,
): Completion {
  const commands = useAbacus((state) => state.commands);
  const models = useAbacus((state) => state.models);
  const searchFiles = useAbacus((state) => state.searchFiles);
  const [caret, setCaret] = useState(0);
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [files, setFiles] = useState<{ query: string; paths: string[] } | null>(null);

  const mention = useMemo(() => mentionAt(draft, caret), [draft, caret]);
  const query = mention ? mention.query : null;
  const options = useMemo(() => {
    const ids = models.map((model) => model.id);
    return (name: string) =>
      ({
        mode: MODE_OPTIONS,
        effort: EFFORT_OPTIONS,
        theme: THEME_OPTIONS,
        model: ids.length ? ids : undefined,
      })[name];
  }, [models]);

  // Files are searched by the app server; the latest query wins.
  useEffect(() => {
    if (query === null) return;
    let current = true;
    const timer = setTimeout(() => {
      void searchFiles(query).then((paths) => {
        if (current) setFiles({ query, paths });
      });
    }, 90);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, searchFiles]);

  const state = useMemo<CompletionState | null>(() => {
    if (dismissed === draft) return null;
    const command = commandCompletion(draft, caret, commands, options);
    if (command) return command.suggestions.length ? command : null;
    if (mention && files && files.query === mention.query && files.paths.length) {
      return {
        kind: "file",
        query: mention.query,
        suggestions: fileSuggestions(files.paths, mention, caret),
      };
    }
    return null;
  }, [draft, caret, commands, options, mention, files, dismissed]);

  // A new list starts at its top.
  useEffect(() => setSelected(0), [state?.kind, state?.query]);

  const onCaret = () => setCaret(textarea.current?.selectionStart ?? draft.length);

  const accept = (index: number) => {
    const suggestion: Suggestion | undefined = state?.suggestions[index];
    if (!suggestion) return;
    const next = applySuggestion(draft, suggestion);
    if (suggestion.run) {
      run(next.text);
      return;
    }
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!state || event.nativeEvent.isComposing) return false;
    const count = state.suggestions.length;
    switch (event.key) {
      case "ArrowDown":
        setSelected((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        setSelected((index) => (index - 1 + count) % count);
        break;
      case "Tab":
        accept(selected);
        break;
      case "Enter":
        if (event.shiftKey) return false;
        accept(selected);
        break;
      case "Escape":
        setDismissed(draft);
        break;
      default:
        return false;
    }
    event.preventDefault();
    return true;
  };

  return { state, selected, onKeyDown, accept, onCaret };
}

const TITLES = { command: "Commands", argument: "Options", file: "Files" } as const;

export function CompletionList({ completion }: { completion: Completion }) {
  const list = useRef<HTMLUListElement>(null);
  const { state, selected } = completion;

  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!state) return null;
  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-popover-border bg-popover shadow-[0_12px_40px_-12px_rgb(0_0_0/0.5)]">
      <div className="abacus-label px-3 pt-2.5 pb-1.5">{TITLES[state.kind]}</div>
      <ul
        ref={list}
        role="listbox"
        aria-label={TITLES[state.kind]}
        className="max-h-72 overflow-y-auto px-1.5 pb-1.5"
      >
        {state.suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.label}-${index}`}
            data-index={index}
            role="option"
            aria-selected={index === selected}
            // mousedown, not click: the textarea must not lose focus first.
            onMouseDown={(event) => {
              event.preventDefault();
              completion.accept(index);
            }}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-ui-base",
              index === selected ? "bg-menu-hover text-foreground" : "text-foreground-subtle",
            )}
          >
            {state.kind === "file" ? (
              <FileIcon className="size-3.5 shrink-0 text-foreground-subtlest" />
            ) : state.kind === "command" ? (
              <SlashIcon className="size-3.5 shrink-0 text-foreground-subtlest" />
            ) : null}
            <span
              className={cn(
                "shrink-0",
                state.kind !== "argument" && "font-mono text-ui-sm text-foreground",
              )}
            >
              {state.kind === "command" ? suggestion.label.slice(1) : suggestion.label}
            </span>
            {suggestion.detail ? (
              <span className="min-w-0 flex-1 truncate text-ui-sm text-foreground-subtlest">
                {suggestion.detail}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {suggestion.badge ? (
              <span className="shrink-0 rounded-sm border border-brand/30 px-1.5 py-px font-mono text-[10px] tracking-wider text-brand uppercase">
                {suggestion.badge}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
