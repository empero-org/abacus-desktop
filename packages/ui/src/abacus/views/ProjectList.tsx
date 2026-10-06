// The sidebar's project tree: each project with its sessions, a menu per
// project, and the projects that live on other devices.

import { useEffect, useState } from "react";
import {
  AppWindowIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { Project, ProjectSession } from "../bridge.js";
import { useAbacus } from "../context.js";
import { relativeTime } from "../format.js";

const SESSIONS_SHOWN = 5;

export function ProjectGroup({
  project,
  forceOpen = false,
  showAll = false,
}: {
  project: Project;
  forceOpen?: boolean;
  showAll?: boolean;
}) {
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const newThreadIn = useAbacus((state) => state.newThreadIn);
  const current = project.path === workspace;
  const [open, setOpen] = useState(current);
  const [all, setAll] = useState(false);
  const expanded = forceOpen || open;

  // The project being worked in unfolds when it becomes the open one.
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);

  const sessions = showAll || all ? project.sessions : project.sessions.slice(0, SESSIONS_SHOWN);
  const hidden = project.sessions.length - sessions.length;

  return (
    <section className="mb-0.5">
      <div className="group/project relative flex items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-14 pl-2.5 text-left text-ui-base text-foreground-subtle hover:bg-hover hover:text-foreground",
            current && "text-foreground",
          )}
          aria-expanded={expanded}
          title={project.path}
        >
          {expanded ? (
            <FolderOpenIcon
              className={cn("size-4 shrink-0", current ? "text-brand" : "text-foreground-subtlest")}
            />
          ) : (
            <FolderIcon
              className={cn("size-4 shrink-0", current ? "text-brand" : "text-foreground-subtlest")}
            />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
        </button>
        <div className="absolute right-1 flex items-center opacity-0 group-hover/project:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={working}
                onClick={() => void newThreadIn(project.path)}
                className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground disabled:opacity-40"
                aria-label={`New thread in ${project.name}`}
              >
                <SquarePenIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New thread in {project.name}</TooltipContent>
          </Tooltip>
          <ProjectMenu project={project} />
        </div>
      </div>

      {expanded ? (
        <ul className="flex flex-col gap-px pt-0.5 pb-1">
          {sessions.length === 0 ? (
            <li className="py-1 pl-9 text-ui-sm text-foreground-subtlest">No sessions yet</li>
          ) : (
            sessions.map((session) => (
              <SessionRow key={session.id} project={project} session={session} />
            ))
          )}
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setAll(true)}
                className="w-full rounded-lg py-1 pl-9 text-left text-ui-sm text-foreground-subtlest hover:text-foreground"
              >
                Show {hidden} more
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function SessionRow({ project, session }: { project: Project; session: ProjectSession }) {
  const activeId = useAbacus((state) => state.thread?.threadId);
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const view = useAbacus((state) => state.view);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const openSession = useAbacus((state) => state.openSession);
  const active = view === "chat" && workspace === project.path && activeId === session.id;
  const disabled = running && !active;

  const row = (
    <button
      type="button"
      onClick={() => void openSession(project.path, session.id)}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-9 text-left text-ui-base text-foreground-subtle hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        active && "bg-selected text-foreground hover:bg-selected",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{session.title || "New session"}</span>
      {active && running ? (
        <span
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand"
          aria-label="Working"
        />
      ) : (
        <span className="shrink-0 text-ui-xs text-foreground-subtlest">
          {shortTime(session.updatedAt)}
        </span>
      )}
    </button>
  );
  return (
    <li>
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
    </li>
  );
}

function ProjectMenu({ project }: { project: Project }) {
  const forgetWorkspace = useAbacus((state) => state.forgetWorkspace);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
          aria-label={`More for ${project.name}`}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="min-w-52">
        <DropdownMenuItem
          onSelect={() => void window.abacus?.newWindow(project.path)}
          className="gap-2.5"
        >
          <AppWindowIcon className="size-3.5" />
          Open in new window
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void window.abacus?.revealPath(project.path)}
          className="gap-2.5"
        >
          <FolderOpenIcon className="size-3.5" />
          Show in file manager
        </DropdownMenuItem>
        {project.sessions.length === 0 ? (
          <DropdownMenuItem onSelect={() => void forgetWorkspace(project.path)} className="gap-2.5">
            <XIcon className="size-3.5" />
            Remove from sidebar
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Projects whose sessions synced here but whose folder lives on another machine. */
export function OtherDevices({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const count = projects.reduce((sum, project) => sum + project.sessions.length, 0);
  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 pt-1 pb-1.5 text-left"
        aria-expanded={open}
      >
        <span className="abacus-label flex-1">Other devices</span>
        <span className="text-ui-xs text-foreground-subtlest">{count}</span>
        <ChevronRightIcon
          className={cn(
            "size-3 text-foreground-subtlest transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open
        ? projects.map((project) => (
            <div key={project.path} className="px-2.5 py-1.5" title={project.path}>
              <div className="truncate text-ui-sm text-foreground-subtle">{project.name}</div>
              <div className="truncate font-mono text-ui-xs text-foreground-subtlest">
                {project.sessions.length} {project.sessions.length === 1 ? "session" : "sessions"} ·{" "}
                {project.path}
              </div>
            </div>
          ))
        : null}
    </section>
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
