// The sidebar: new thread and search on top, then the pinned sessions, the
// groups made here, every project with its abacus sessions (synced ones
// included, forks nested under what they came from; pinned projects first,
// then the ones worked in last), and settings at the bottom. On macOS the top
// strip leaves room for the traffic lights.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  FolderPlusIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { Project, ProjectSession } from "../bridge.js";
import { useAbacus } from "../context.js";
import { arrange, useGroups, type PlacedSession } from "../groups.js";
import { orderProjects, usePins } from "../pins.js";
import { BrandMark } from "./BrandMark.js";
import { ChatList, SectionTabs } from "./ChatList.js";
import { GroupsSection, NewGroupButton } from "./GroupList.js";
import { OtherDevices, ProjectGroup } from "./ProjectList.js";
import { ReportBug } from "./ReportBug.js";
import { SessionTree } from "./SessionTree.js";

/** How often the sidebar asks again which sessions are open or working elsewhere. */
const LIVE_REFRESH_MS = 30_000;

export function Sidebar({ platform }: { platform: string | undefined }) {
  const all = useSidebarProjects();
  const chatsPath = useAbacus((state) => state.appInfo?.chats ?? null);
  const section = useAbacus((state) => (chatsPath ? state.section : "code"));
  const setSection = useAbacus((state) => state.setSection);
  // The chats are the sessions of their own folder, not a project.
  const chats = all.find((project) => project.path === chatsPath) ?? null;
  const projects = useMemo(
    () => all.filter((project) => project.path !== chatsPath),
    [all, chatsPath],
  );
  const groups = useGroups();
  const pins = usePins();
  useLiveRefresh();
  const workspace = useAbacus((state) => state.workspace?.workspace ?? null);
  const view = useAbacus((state) => state.view);
  const setView = useAbacus((state) => state.setView);
  const pickAndOpen = useAbacus((state) => state.pickAndOpen);
  const newThreadIn = useAbacus((state) => state.newThreadIn);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const here = useMemo(
    () =>
      orderProjects(
        projects.filter((project) => project.exists),
        pins.projects,
      ),
    [projects, pins.projects],
  );
  const elsewhere = projects.filter((project) => !project.exists);
  // Sessions on another device cannot be opened here, so they join no group
  // and are never pinned.
  const arranged = useMemo(
    () => arrange(here, groups, pins.sessions),
    [here, groups, pins.sessions],
  );
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
      {chatsPath ? <SectionTabs section={section} onChange={setSection} /> : null}

      <div className="flex flex-col gap-0.5 px-2 pb-3">
        {section === "chat" && chatsPath ? (
          <SidebarButton
            icon={SquarePenIcon}
            label="New chat"
            onClick={() => void newThreadIn(chatsPath)}
          />
        ) : (
          <SidebarButton
            icon={SquarePenIcon}
            label="New thread"
            onClick={() =>
              void (workspace && workspace !== chatsPath ? newThreadIn(workspace) : pickAndOpen())
            }
          />
        )}
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

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        aria-label={section === "chat" ? "Chats" : "Projects"}
      >
        {section === "chat" ? (
          <ChatList chats={chats} needle={needle} />
        ) : needle ? (
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
            <PinnedSection entries={arranged.pinned} />
            <GroupsSection entries={arranged.groups} />
            <div className="group/section flex items-center px-2.5 pt-1 pb-1.5">
              <span className="abacus-label flex-1">Projects</span>
              {arranged.groups.length === 0 ? <NewGroupButton /> : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void pickAndOpen()}
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
              here.map((project) => (
                <ProjectGroup
                  key={project.path}
                  project={project}
                  sessions={arranged.projects.get(project.path)}
                  pinned={pins.projects.includes(project.path)}
                />
              ))
            )}
            {elsewhere.length > 0 ? <OtherDevices projects={elsewhere} /> : null}
          </>
        )}
      </nav>

      <div className="flex flex-col gap-1.5 px-2 pt-1 pb-2.5">
        <UpdateAvailable />
        <div className="flex items-center gap-1">
          <SidebarButton
            icon={SettingsIcon}
            label="Settings"
            active={view === "settings"}
            onClick={() => setView(view === "settings" ? "chat" : "settings")}
            className="flex-1"
          />
          <ReportBug />
        </div>
      </div>
    </aside>
  );
}

/** Above Settings while a newer release of this app or the CLI is out. */
function UpdateAvailable() {
  const updates = useAbacus((state) => state.updates);
  const showUpdates = useAbacus((state) => state.showUpdates);
  const out = [
    updates?.desktop ? `Abacus desktop ${updates.desktop.latest}` : null,
    updates?.cli ? `abacus ${updates.cli.latest}` : null,
  ].filter(Boolean);
  if (out.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={showUpdates}
          className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-ui-base text-foreground hover:bg-hover"
        >
          <span className="flex-1">Update available</span>
          <ArrowRightIcon className="size-4 text-foreground-subtle" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{out.join(" and ")}</TooltipContent>
    </Tooltip>
  );
}

/** Sessions pinned from any project, above the groups and the projects. */
function PinnedSection({ entries }: { entries: PlacedSession[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex items-center px-2.5 pt-1 pb-1.5">
        <span className="abacus-label flex-1">Pinned</span>
      </div>
      <ul className="flex flex-col gap-px">
        <SessionTree entries={entries} showProject pinned />
      </ul>
    </div>
  );
}

/**
 * Keep the open and working badges current. Other sessions start and finish
 * turns in their own terminals and windows, and nothing tells this one, so it
 * asks again now and then — only while the window is being looked at.
 */
function useLiveRefresh() {
  const refreshProjects = useAbacus((state) => state.refreshProjects);
  const refreshThreads = useAbacus((state) => state.refreshThreads);
  const ready = useAbacus((state) => state.phase === "ready");
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshProjects();
      if (ready) void refreshThreads();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshProjects, refreshThreads, ready]);
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
      forkedFrom: thread.forkedFrom ?? null,
      live: thread.live ?? null,
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
  className,
}: {
  icon: typeof SettingsIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ui-base text-foreground hover:bg-hover disabled:opacity-50",
        active && "bg-selected",
        className,
      )}
    >
      <Icon className="size-4 text-foreground-subtle" />
      {label}
    </button>
  );
}
