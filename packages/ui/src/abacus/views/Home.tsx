// The main pane with no project open: open one, or pick up where you left off.

import { FolderOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAbacus } from "../context.js";
import { relativeTime } from "../format.js";
import { BrandMark } from "./BrandMark.js";

export function Home() {
  const projects = useAbacus((state) => state.projects);
  const recent = useAbacus((state) => state.recent);
  const pickAndOpen = useAbacus((state) => state.pickAndOpen);
  const openSession = useAbacus((state) => state.openSession);
  const openWorkspace = useAbacus((state) => state.openWorkspace);

  // The latest sessions across projects, so the last thing worked on is one click away.
  const latest = (projects ?? [])
    .filter((project) => project.exists)
    .flatMap((project) => project.sessions.map((session) => ({ project, session })))
    .sort((left, right) => Date.parse(right.session.updatedAt) - Date.parse(left.session.updatedAt))
    .slice(0, 5);

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pt-[14vh] pb-12">
      <div className="flex w-full max-w-xl flex-col gap-9">
        <header className="flex flex-col gap-4">
          <BrandMark className="size-8 text-foreground" />
          <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-balance">
            What are we building <span className="text-brand">today?</span>
          </h1>
          <p className="text-ui-lg text-foreground-subtle">
            Open a project folder and abacus works in it: reading, changing and running your code,
            with anything risky reviewed before it runs.
          </p>
          <div>
            <Button size="lg" onClick={() => void pickAndOpen()} className="gap-2">
              <FolderOpenIcon className="size-4" />
              Open a project
            </Button>
          </div>
        </header>

        {latest.length > 0 ? (
          <section className="flex flex-col gap-2.5">
            <span className="abacus-label">Continue</span>
            <ul className="flex flex-col">
              {latest.map(({ project, session }) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => void openSession(project.path, session.id)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-ui-base">
                      {session.title || "New session"}
                    </span>
                    <span className="shrink-0 text-ui-sm text-foreground-subtle">
                      {project.name}
                    </span>
                    <span className="w-20 shrink-0 text-right text-ui-sm text-foreground-subtlest">
                      {relativeTime(session.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : recent.length > 0 ? (
          <section className="flex flex-col gap-2.5">
            <span className="abacus-label">Recent projects</span>
            <ul className="flex flex-col">
              {recent.slice(0, 5).map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => void openWorkspace(entry.path)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-ui-base">{entry.name}</span>
                    <span className="min-w-0 truncate font-mono text-ui-sm text-foreground-subtlest">
                      {entry.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
