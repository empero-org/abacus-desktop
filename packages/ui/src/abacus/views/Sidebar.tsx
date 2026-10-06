// The sidebar: new thread and search on top, then every project with its
// abacus sessions (synced ones included), and settings at the bottom. On macOS
// the top strip leaves room for the traffic lights.

import { useMemo, useState } from "react";
import { FolderPlusIcon, SearchIcon, SettingsIcon, SquarePenIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { Project, ProjectSession } from "../bridge.js";
import { useAbacus } from "../context.js";
import { BrandMark } from "./BrandMark.js";
import { OtherDevices, ProjectGroup } from "./ProjectList.js";

export function Sidebar({ platform }: { platform: string | undefined }) {
  const projects = useSidebarProjects();
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const view = useAbacus((state) => state.view);
  const setView = useAbacus((state) => state.setView);
  const pickAndOpen = useAbacus((state) => state.pickAndOpen);
  const newThreadIn = useAbacus((state) => state.newThreadIn);
  const working = useAbacus((state) => Boolean(state.thread?.turnId));
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const here = projects.filter((project) => project.exists);
  const elsewhere = projects.filter((project) => !project.exists);
  const matches = useMemo(
    () =>
      needle
        ? projects
            .map((project) => ({
              ...project,
              sessions: project.sessions.filter((session) =>
                session.title.toLowerCase().includes(needle),
              ),
            }))
            .filter(
              (project) =>
                project.sessions.length > 0 || project.name.toLowerCase().includes(needle),
            )
        : [],
    [projects, needle],
  );

  return (
    <aside className="flex w-[272px] shrink-0 flex-col bg-sidebar">
      <div
        className={cn(
          "app-drag flex h-[var(--app-chrome-height)] shrink-0 items-center gap-2 px-4",
          platform === "darwin" && "pl-[84px]",
        )}
      >
        {platform !== "darwin" ? <BrandMark className="size-4 text-foreground" /> : null}
        <span className="text-ui-base font-medium tracking-tight">abacus</span>
      </div>

      <div className="flex flex-col gap-0.5 px-2 pb-3">
        <SidebarButton
          icon={SquarePenIcon}
          label="New thread"
          disabled={working}
          onClick={() => void (workspace ? newThreadIn(workspace) : pickAndOpen())}
        />
        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ui-base text-foreground-subtle focus-within:bg-hover">
          <SearchIcon className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-foreground-subtle"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-foreground-subtlest hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Projects">
        {needle ? (
          matches.length === 0 ? (
            <p className="px-2.5 py-4 text-ui-sm text-foreground-subtlest">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            matches.map((project) => (
              <ProjectGroup key={project.path} project={project} forceOpen showAll />
            ))
          )
        ) : (
          <>
            <div className="group/section flex items-center px-2.5 pt-1 pb-1.5">
              <span className="abacus-label flex-1">Projects</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void pickAndOpen()}
                    disabled={working}
                    className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground disabled:opacity-40"
                    aria-label="Open a project"
                  >
                    <FolderPlusIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Open a project</TooltipContent>
              </Tooltip>
            </div>
            {here.length === 0 ? (
              <p className="px-2.5 py-2 text-ui-sm text-foreground-subtlest">
                Projects you work on with abacus show up here, with their sessions.
              </p>
            ) : (
              here.map((project) => <ProjectGroup key={project.path} project={project} />)
            )}
            {elsewhere.length > 0 ? <OtherDevices projects={elsewhere} /> : null}
          </>
        )}
      </nav>

      <div className="px-2 pt-1 pb-2.5">
        <SidebarButton
          icon={SettingsIcon}
          label="Settings"
          active={view === "settings"}
          onClick={() => setView(view === "settings" ? "chat" : "settings")}
        />
      </div>
    </aside>
  );
}

/**
 * The projects to list. The CLI's listing is the source; the open project's
 * sessions come from its own server, which knows about a turn the moment it
 * ends. With a CLI too old to list everything, the open project and the recent
 * folders stand in.
 */
function useSidebarProjects(): Project[] {
  const projects = useAbacus((state) => state.projects);
  const recent = useAbacus((state) => state.recent);
  const workspace = useAbacus((state) => state.workspace);
  const threads = useAbacus((state) => state.threads);

  return useMemo(() => {
    const live: ProjectSession[] = threads.map((thread) => ({
      id: thread.threadId,
      title: thread.name,
      model: thread.model,
      updatedAt: thread.updatedAt,
      messageCount: thread.itemCount,
    }));
    const base: Project[] =
      projects ??
      recent.map((entry) => ({
        path: entry.path,
        name: entry.name,
        exists: true,
        sessions: [],
        activeAt: entry.openedAt,
      }));
    if (!workspace) return base;
    const current = base.find((project) => project.path === workspace.workspace);
    const merged: Project = {
      path: workspace.workspace,
      name: workspace.name,
      exists: true,
      sessions: live.length > 0 ? live : (current?.sessions ?? []),
      activeAt: current?.activeAt ?? new Date().toISOString(),
    };
    return current
      ? base.map((project) => (project === current ? merged : project))
      : [merged, ...base];
  }, [projects, recent, workspace, threads]);
}

function SidebarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: typeof SettingsIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ui-base text-foreground hover:bg-hover disabled:opacity-50",
        active && "bg-selected",
      )}
    >
      <Icon className="size-4 text-foreground-subtle" />
      {label}
    </button>
  );
}
