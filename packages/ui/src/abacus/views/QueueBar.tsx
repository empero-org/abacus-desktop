// Messages written while abacus works, stacked at the top of the composer,
// oldest first. Each waits for the turn to end unless the person hands it
// over sooner: Steer gives it to the running turn, and it stays here, marked,
// until the model reads it after its current step; Send now stops the turn
// and sends it straight away.

import type { ReactNode } from "react";
import {
  CornerDownRightIcon,
  EllipsisIcon,
  ListEndIcon,
  PencilLineIcon,
  Trash2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useAbacus } from "../context.js";
import { queuedLabel, type QueuedMessage } from "../queue.js";

const NONE: QueuedMessage[] = [];

export function QueueBar() {
  const queued = useAbacus((state) =>
    state.thread ? (state.queued[state.thread.threadId] ?? NONE) : NONE,
  );
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const sendingNow = useAbacus((state) =>
    state.thread ? state.sendingNow[state.thread.threadId] : undefined,
  );
  if (queued.length === 0) return null;

  return (
    <ul className="flex flex-col gap-0.5 border-b px-1.5 py-1.5" aria-label="Queued messages">
      {queued.map((message) => (
        <QueuedRow
          key={message.id}
          message={message}
          running={running}
          sending={message.id === sendingNow}
        />
      ))}
    </ul>
  );
}

function QueuedRow({
  message,
  running,
  sending,
}: {
  message: QueuedMessage;
  running: boolean;
  sending: boolean;
}) {
  const steer = useAbacus((state) => state.steerQueued);
  const sendNow = useAbacus((state) => state.sendQueuedNow);
  const remove = useAbacus((state) => state.removeQueued);
  const edit = useAbacus((state) => state.editQueued);

  return (
    <li className="flex items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-2.5 text-ui-sm hover:bg-hover/50">
      <ListEndIcon className="mr-1 size-3.5 shrink-0 text-foreground-subtlest" />
      <span className="min-w-0 flex-1 truncate">{queuedLabel(message)}</span>
      {sending ? (
        <span className="px-2 py-1 text-foreground-subtlest">Sending once the turn stops…</span>
      ) : (
        <>
          {message.steering !== undefined ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 px-2 py-1 text-brand">
                  <CornerDownRightIcon className="size-3.5" />
                  Steering
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">abacus reads it after its current step</TooltipContent>
            </Tooltip>
          ) : running ? (
            <Action
              hint="Give it to abacus now; it reads it after its current step"
              onClick={() => void steer(message.id)}
            >
              <CornerDownRightIcon className="size-3.5" />
              Steer
            </Action>
          ) : null}
          <Action
            hint={running ? "Stop the current turn and send this straight away" : "Send this now"}
            onClick={() => void sendNow(message.id)}
          >
            Send now
          </Action>
          <button
            type="button"
            onClick={() => remove(message.id)}
            aria-label="Remove"
            className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
          >
            <Trash2Icon className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
              >
                <EllipsisIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onSelect={() => void edit(message.id)} className="gap-2.5">
                <PencilLineIcon className="size-3.5" />
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}

function Action({
  hint,
  onClick,
  children,
}: {
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-foreground-subtle hover:bg-hover hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}
