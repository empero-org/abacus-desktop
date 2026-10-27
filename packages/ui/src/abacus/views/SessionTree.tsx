// The sidebar's session rows: each session with, under it, the forks made
// from it. A row opens its session, drags onto a group, shows whether the
// session is open or working elsewhere, and has a menu to fork it or move it
// between groups.

import { EllipsisIcon, GitBranchIcon, LayersIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { SessionLive } from "../bridge.js";
import { useAbacus } from "../context.js";
import { relativeTime } from "../format.js";
import {
  addGroup,
  changeGroups,
  freshGroups,
  groupOf,
  moveSession,
  newGroupId,
  SESSION_DRAG_TYPE,
  useGroups,
  type PlacedSession,
} from "../groups.js";

/** Sessions and, under each, the forks made from it. */
export function SessionTree({
  entries,
  depth = 0,
  showProject = false,
}: {
  entries: PlacedSession[];
  depth?: number;
  /** Name each session's project, where sessions from several share a list. */
  showProject?: boolean;
}) {
  return entries.map((entry) => (
    <SessionBranch key={entry.session.id} entry={entry} depth={depth} showProject={showProject} />
  ));
}

function SessionBranch({
  entry,
  depth,
  showProject,
}: {
  entry: PlacedSession;
  depth: number;
  showProject: boolean;
}) {
  return (
    <>
      <SessionRow entry={entry} depth={depth} showProject={showProject} />
      {entry.forks.length > 0 ? (
        <SessionTree entries={entry.forks} depth={depth + 1} showProject={showProject} />
      ) : null}
    </>
  );
}

/** Rows start under the project's name; each level of forking steps in once more. */
const ROW_INDENT_PX = 36;
const FORK_INDENT_PX = 14;

function SessionRow({
  entry: { session, project },
  depth,
  showProject,
}: {
  entry: PlacedSession;
  depth: number;
  showProject: boolean;
}) {
  const activeId = useAbacus((state) => state.thread?.threadId);
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const view = useAbacus((state) => state.view);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const openSession = useAbacus((state) => state.openSession);
  const active = view === "chat" && workspace === project.path && activeId === session.id;
  const disabled = running && !active;
  const title = session.title || "New session";

  const row = (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(SESSION_DRAG_TYPE, session.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => void openSession(project.path, session.id)}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      title={showProject ? `${project.name} · ${title}` : undefined}
      style={{ paddingLeft: ROW_INDENT_PX + depth * FORK_INDENT_PX }}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-ui-base text-foreground-subtle hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        active && "bg-selected text-foreground hover:bg-selected",
      )}
    >
      {depth > 0 ? (
        <GitBranchIcon className="size-3 shrink-0 text-foreground-subtlest" aria-label="Fork" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {showProject ? (
        <span className="max-w-20 shrink-0 truncate text-ui-xs text-foreground-subtlest">
          {project.name}
        </span>
      ) : null}
      <span className="flex shrink-0 items-center group-hover/session:invisible group-has-[[aria-expanded=true]]/session:invisible">
        {active && running ? (
          <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-label="Working" />
        ) : session.live && !active ? (
          <LiveDot live={session.live} />
        ) : (
          <span className="text-ui-xs text-foreground-subtlest">
            {shortTime(session.updatedAt)}
          </span>
        )}
      </span>
    </button>
  );
  return (
    <li className="group/session relative">
      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block">{row}</span>
          </TooltipTrigger>
          <TooltipContent side="right">Finish or stop the running turn first</TooltipContent>
        </Tooltip>
      ) : (
        row
      )}
      <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/session:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
        <SessionMenu
          sessionId={session.id}
          title={title}
          forkable={project.path === workspace && !running}
        />
      </div>
    </li>
  );
}

/** A session open somewhere else: in a terminal, another window, or a headless run. */
function LiveDot({ live }: { live: SessionLive }) {
  const where =
    live.frontEnd === "tui"
      ? "a terminal"
      : live.frontEnd === "desktop"
        ? "another window"
        : live.frontEnd === "headless"
          ? "a headless run"
          : "another abacus";
  const label = live.state === "working" ? `Working in ${where}` : `Open in ${where}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "size-1.5 rounded-full",
        live.state === "working" ? "animate-pulse bg-brand" : "border border-brand",
      )}
    />
  );
}

function SessionMenu({
  sessionId,
  title,
  forkable,
}: {
  sessionId: string;
  title: string;
  /** In the open project, with no turn running: the server can fork it now. */
  forkable: boolean;
}) {
  const groups = useGroups();
  const canFork = useAbacus((state) => Boolean(state.capabilities.fork));
  const forkThread = useAbacus((state) => state.forkThread);
  const current = groupOf(groups, sessionId);
  const others = groups.filter((group) => group !== current);
  const intoNewGroup = () => {
    const id = newGroupId();
    freshGroups.add(id);
    changeGroups((all) => moveSession(addGroup(all, id, "New group"), sessionId, id));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
          aria-label={`More for ${title}`}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="min-w-52">
        {canFork ? (
          <DropdownMenuItem
            disabled={!forkable}
            onSelect={() => void forkThread(sessionId)}
            className="gap-2.5"
          >
            <GitBranchIcon className="size-3.5" />
            Fork
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2.5">
            <LayersIcon className="size-3.5" />
            {current ? "Move to group" : "Add to group"}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {others.map((group) => (
              <DropdownMenuItem
                key={group.id}
                onSelect={() => changeGroups((all) => moveSession(all, sessionId, group.id))}
              >
                <span className="truncate">{group.name}</span>
              </DropdownMenuItem>
            ))}
            {others.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={intoNewGroup} className="gap-2.5">
              <PlusIcon className="size-3.5" />
              New group
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {current ? (
          <DropdownMenuItem
            onSelect={() => changeGroups((all) => moveSession(all, sessionId, null))}
            className="gap-2.5"
          >
            <XIcon className="size-3.5" />
            Remove from {current.name}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "now", "5m", "3h", "2d", then a date: the sidebar has no room for "ago". */
function shortTime(iso: string): string {
  const ago = Date.now() - Date.parse(iso);
  if (Number.isNaN(ago)) return "";
  if (ago < 60_000) return "now";
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m`;
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)}h`;
  if (ago < 7 * 86_400_000) return `${Math.floor(ago / 86_400_000)}d`;
  return relativeTime(iso);
}
