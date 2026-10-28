// The sidebar's project tree: each project with its latest sessions shown
// (forks nested under the session they came from, see SessionTree), a menu per
// project to pin it and more, and the projects that live on other devices.

import { useEffect, useState } from "react";
import {
  AppWindowIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderIcon,
  FolderOpenIcon,
  PinIcon,
  PinOffIcon,
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
import type { Project } from "../bridge.js";
import { useAbacus } from "../context.js";
import { flat, type PlacedSession } from "../groups.js";
import { changePins, toggleProjectPin } from "../pins.js";
import { SessionTree } from "./SessionTree.js";

/** The latest sessions a project shows before "Show more"; a few more for the open one. */
const LATEST_SHOWN = 3;
const LATEST_SHOWN_OPEN = 5;

export function ProjectGroup({
  project,
  sessions: placed,
  forceOpen = false,
  showAll = false,
  pinned = false,
}: {
  project: Project;
  /** What shows under the project; every session, unnested, when not given. */
  sessions?: PlacedSession[];
  forceOpen?: boolean;
  showAll?: boolean;
  pinned?: boolean;
}) {
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const newThreadIn = useAbacus((state) => state.newThreadIn);
  const current = project.path === workspace;
  // Every project shows its latest sessions without being opened; folding
  // one hides them.
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const expanded = forceOpen || open;

  // The project being worked in unfolds when it becomes the open one.
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);

  const roots = placed ?? flat(project);
  const shown = current ? LATEST_SHOWN_OPEN : LATEST_SHOWN;
  const sessions = showAll || all ? roots : roots.slice(0, shown);
  const hidden = roots.length - sessions.length;
  // An empty project says so only where a session would start: the open one.
  const empty = sessions.length === 0 && !current;

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
          {pinned ? (
            <PinIcon className="size-3 shrink-0 text-foreground-subtlest" aria-label="Pinned" />
          ) : null}
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
          <ProjectMenu project={project} pinned={pinned} />
        </div>
      </div>

      {expanded && !empty ? (
        <ul className="flex flex-col gap-px pt-0.5 pb-1">
          {sessions.length === 0 ? (
            <li className="py-1 pl-9 text-ui-sm text-foreground-subtlest">
              {project.sessions.length === 0 ? "No sessions yet" : "Every session is in a group"}
            </li>
          ) : (
            <SessionTree entries={sessions} />
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

function ProjectMenu({ project, pinned }: { project: Project; pinned: boolean }) {
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
          onSelect={() => changePins((pins) => toggleProjectPin(pins, project.path))}
          className="gap-2.5"
        >
          {pinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
          {pinned ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
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
