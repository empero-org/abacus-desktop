// What the agent is blocked on: an approval for a command or an edit, or a
// question. One at a time, oldest first; the rest wait their turn. In AUTO a
// reviewer model decides most actions, so an approval only reaches the person
// when it could not.

import { useState, type ReactNode } from "react";
import { CircleHelpIcon, FilePenIcon, GlobeIcon, SquareTerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useAbacus } from "../context.js";
import type { ApprovalRequestParams, ServerRequest, UserInputRequestParams } from "../protocol.js";

export function Requests() {
  const pending = useAbacus((state) => state.thread?.pending ?? []);
  const first = pending[0];
  if (!first) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {first.kind === "approval" ? (
        <ApprovalCard key={first.id} id={first.id} method={first.method} params={first.params} />
      ) : (
        <QuestionCard key={first.id} id={first.id} params={first.params} />
      )}
      {pending.length > 1 ? (
        <span className="px-1 text-ui-sm text-foreground-subtlest">
          {pending.length - 1} more waiting
        </span>
      ) : null}
    </div>
  );
}

function Card({ children, tone }: { children: ReactNode; tone: "ask" | "question" }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)]",
        tone === "ask" ? "border-warning/35" : "border-brand/40",
      )}
      role="alertdialog"
    >
      {children}
    </section>
  );
}

function ApprovalCard({
  id,
  method,
  params,
}: {
  id: ServerRequest["id"];
  method: string;
  params: ApprovalRequestParams;
}) {
  const answer = useAbacus((state) => state.answerApproval);
  const [busy, setBusy] = useState(false);
  const command = method === "item/commandExecution/requestApproval";
  const browsing = params.tool.startsWith("browser_");
  const Icon = command ? SquareTerminalIcon : browsing ? GlobeIcon : FilePenIcon;
  const decide = (decision: Parameters<typeof answer>[1]) => {
    setBusy(true);
    void answer(id, decision).finally(() => setBusy(false));
  };

  return (
    <Card tone="ask">
      <div className="flex items-center gap-2 text-ui-base font-medium">
        <Icon className="size-4 text-warning" />
        {command
          ? "Run this command?"
          : browsing
            ? "Let abacus do this in the browser?"
            : "Allow this change?"}
        <span className="ml-auto font-mono text-ui-sm font-normal text-foreground-subtlest">
          {params.tool}
        </span>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-terminal-bg px-3 py-2.5 font-mono text-ui-sm leading-relaxed whitespace-pre-wrap break-words text-terminal-fg">
        {params.command}
      </pre>
      {params.reason ? <p className="text-ui-sm text-foreground-subtle">{params.reason}</p> : null}
      <p className="text-ui-sm text-foreground-subtlest">
        The safety review could not decide on this one, so it is your call.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={() => decide("accept")} disabled={busy} autoFocus>
          Allow
        </Button>
        <Button size="lg" variant="outline" onClick={() => decide("decline")} disabled={busy}>
          Deny
        </Button>
        <div className="flex-1" />
        <Button
          size="lg"
          variant="ghost"
          onClick={() => decide("cancel")}
          disabled={busy}
          className="text-foreground-subtle"
          title="Deny and stop the turn"
        >
          Deny and stop
        </Button>
      </div>
    </Card>
  );
}

function QuestionCard({ id, params }: { id: ServerRequest["id"]; params: UserInputRequestParams }) {
  const answer = useAbacus((state) => state.answerQuestion);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (option: string) =>
    setSelected((current) =>
      params.multiSelect
        ? current.includes(option)
          ? current.filter((entry) => entry !== option)
          : [...current, option]
        : [option],
    );
  const ready = selected.length > 0 || custom.trim().length > 0;
  const submit = () => {
    if (!ready) return;
    setBusy(true);
    void answer(id, selected, custom.trim() || undefined).finally(() => setBusy(false));
  };

  return (
    <Card tone="question">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <CircleHelpIcon className="size-4 text-brand" />
          <span className="abacus-label text-brand">{params.header || "Question"}</span>
        </div>
        <p className="text-ui-base leading-relaxed font-medium">{params.question}</p>
      </div>
      {params.options.length > 0 ? (
        <div className="flex flex-col gap-1.5" role={params.multiSelect ? "group" : "radiogroup"}>
          {params.options.map((option) => {
            const on = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                role={params.multiSelect ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => toggle(option)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-ui-base hover:bg-hover",
                  on && "border-brand/60 bg-selected",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center border border-border-hover",
                    params.multiSelect ? "rounded" : "rounded-full",
                    on && "border-brand bg-brand",
                  )}
                >
                  {on ? (
                    <span
                      className={cn(
                        "bg-primary-foreground",
                        params.multiSelect ? "size-1.5 rounded-[1px]" : "size-1.5 rounded-full",
                      )}
                    />
                  ) : null}
                </span>
                {option}
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        placeholder={params.options.length > 0 ? "Or write your own answer" : "Your answer"}
        className="rounded-lg border bg-input px-3 py-2 text-ui-base outline-none placeholder:text-foreground-subtlest focus:border-brand/50"
      />
      <div className="flex gap-2">
        <Button size="lg" onClick={submit} disabled={!ready || busy}>
          Answer
        </Button>
        <Button size="lg" variant="ghost" onClick={() => void answer(id, [])} disabled={busy}>
          Skip
        </Button>
      </div>
    </Card>
  );
}
