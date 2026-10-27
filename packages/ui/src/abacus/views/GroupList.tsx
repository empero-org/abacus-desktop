// The sidebar's groups: sessions gathered by hand from any project, above the
// projects. A group folds like a project does; sessions arrive by dragging a
// row onto it or through a session's menu.

import { useEffect, useRef, useState } from "react";
import {
  ChevronRightIcon,
  EllipsisIcon,
  LayersIcon,
  ListPlusIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import type { SessionGroup } from "../bridge.js";
import {
  addGroup,
  changeGroups,
  countPlaced,
  freshGroups,
  moveSession,
  newGroupId,
  removeGroup,
  renameGroup,
  SESSION_DRAG_TYPE,
  toggleGroup,
  type Arrangement,
} from "../groups.js";
import { SessionTree } from "./SessionTree.js";

export function GroupsSection({ entries }: { entries: Arrangement["groups"] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex items-center px-2.5 pt-1 pb-1.5">
        <span className="abacus-label flex-1">Groups</span>
        <NewGroupButton />
      </div>
      {entries.map(({ group, sessions }) => (
        <GroupBlock key={group.id} group={group} sessions={sessions} />
      ))}
    </div>
  );
}

/** Make an empty group and start naming it. */
export function NewGroupButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            const id = newGroupId();
            freshGroups.add(id);
            changeGroups((groups) => addGroup(groups, id, "New group"));
          }}
          className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground"
          aria-label="New group"
        >
          <ListPlusIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">New group</TooltipContent>
    </Tooltip>
  );
}

function GroupBlock({
  group,
  sessions,
}: {
  group: SessionGroup;
  sessions: Arrangement["groups"][number]["sessions"];
}) {
  const [editing, setEditing] = useState(false);
  const [dropping, setDropping] = useState(false);
  const open = !group.collapsed;

  // A group made a moment ago opens with its name ready to type over.
  useEffect(() => {
    if (freshGroups.delete(group.id)) setEditing(true);
  }, [group.id]);

  return (
    <section
      className={cn("mb-0.5 rounded-lg", dropping && "bg-hover ring-1 ring-brand/40")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const id = event.dataTransfer.getData(SESSION_DRAG_TYPE);
        if (!id) return;
        event.preventDefault();
        // A folded group opens to show what just went into it.
        changeGroups((groups) => {
          const moved = moveSession(groups, id, group.id);
          return group.collapsed ? toggleGroup(moved, group.id) : moved;
        });
      }}
    >
      <div className="group/project relative flex items-center">
        {editing ? (
          <GroupName group={group} onDone={() => setEditing(false)} />
        ) : (
          <button
            type="button"
            onClick={() => changeGroups((groups) => toggleGroup(groups, group.id))}
            onDoubleClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-left text-ui-base text-foreground-subtle hover:bg-hover hover:text-foreground"
            aria-expanded={open}
          >
            <LayersIcon className="size-4 shrink-0 text-foreground-subtlest" />
            <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
            <span className="shrink-0 text-ui-xs text-foreground-subtlest group-hover/project:invisible">
              {countPlaced(sessions)}
            </span>
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 text-foreground-subtlest transition-transform group-hover/project:invisible",
                open && "rotate-90",
              )}
            />
          </button>
        )}
        {editing ? null : (
          <div className="absolute right-1 flex items-center opacity-0 group-hover/project:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
            <GroupMenu group={group} onRename={() => setEditing(true)} />
          </div>
        )}
      </div>

      {open ? (
        <ul className="flex flex-col gap-px pt-0.5 pb-1">
          {sessions.length === 0 ? (
            <li className="py-1 pr-2.5 pl-9 text-ui-sm text-foreground-subtlest">
              Drag sessions here, or add them from a session’s menu
            </li>
          ) : (
            <SessionTree entries={sessions} showProject />
          )}
        </ul>
      ) : null}
    </section>
  );
}

/** The group's name as a field: Enter or leaving keeps it, Escape goes back. */
function GroupName({ group, onDone }: { group: SessionGroup; onDone: () => void }) {
  const [name, setName] = useState(group.name);
  const input = useRef<HTMLInputElement>(null);
  // Escape closes the field, and the blur that follows must not keep the name.
  const settled = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save) changeGroups((groups) => renameGroup(groups, group.id, name));
    onDone();
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-hover py-1 pr-2 pl-2.5">
      <LayersIcon className="size-4 shrink-0 text-foreground-subtlest" />
      <input
        ref={input}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") finish(false);
        }}
        aria-label="Group name"
        className="min-w-0 flex-1 bg-transparent py-0.5 text-ui-base font-medium text-foreground outline-none"
      />
    </div>
  );
}

function GroupMenu({ group, onRename }: { group: SessionGroup; onRename: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-foreground-subtlest hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
          aria-label={`More for ${group.name}`}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="min-w-52">
        <DropdownMenuItem onSelect={onRename} className="gap-2.5">
          <PencilIcon className="size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => changeGroups((groups) => removeGroup(groups, group.id))}
          className="gap-2.5"
        >
          <TrashIcon className="size-3.5" />
          Delete group
          {group.sessions.length > 0 ? (
            <span className="ml-auto text-ui-xs text-foreground-subtlest">keeps sessions</span>
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
