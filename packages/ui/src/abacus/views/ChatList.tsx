// The sidebar's Chat side: conversations with no project, where the model has
// the web and Python rather than a folder's files, shell and git. Chats are
// the sessions of their own folder (`AppInfo.chats`), which the Code side
// leaves out of its projects.

import { CodeIcon, MessageCircleIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import type { Project } from "../bridge.js";
import type { AbacusState } from "../state.js";
import { SessionTree } from "./SessionTree.js";

/** Chat or Code, at the top of the sidebar. */
export function SectionTabs({
  section,
  onChange,
}: {
  section: AbacusState["section"];
  onChange: (section: AbacusState["section"]) => void;
}) {
  const tab = (value: AbacusState["section"], label: string, Icon: typeof CodeIcon) => (
    <button
      type="button"
      role="tab"
      aria-selected={section === value}
      onClick={() => onChange(value)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-ui-sm text-foreground-subtle hover:text-foreground",
        section === value && "bg-selected text-foreground shadow-xs",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
  return (
    <div role="tablist" className="mx-2 mb-2 flex gap-1 rounded-lg border bg-card p-0.5">
      {tab("chat", "Chat", MessageCircleIcon)}
      {tab("code", "Code", CodeIcon)}
    </div>
  );
}

/** Every chat, newest first, or those whose title matches the search. */
export function ChatList({ chats, needle }: { chats: Project | null; needle: string }) {
  const sessions = (chats?.sessions ?? []).filter(
    (session) => !needle || session.title.toLowerCase().includes(needle),
  );
  return (
    <div>
      <div className="flex items-center px-2.5 pt-1 pb-1.5">
        <span className="abacus-label flex-1">Chats</span>
      </div>
      {sessions.length === 0 ? (
        <p className="px-2.5 py-2 text-ui-sm text-foreground-subtlest">
          {needle
            ? "No chat matches."
            : "Chats you start show up here. A chat has the web and Python, not a project's files."}
        </p>
      ) : chats ? (
        <ul className="flex flex-col gap-px">
          <SessionTree
            entries={sessions.map((session) => ({ session, project: chats, forks: [] }))}
            chat
          />
        </ul>
      ) : null}
    </div>
  );
}
