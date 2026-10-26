// Settings: the window's look, the agent's defaults for the open project, Abacus
// Sync, and what is installed. Agent settings are abacus's own (the profile in
// ~/.abacus), so a change here is the change `/config` would make in the TUI.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MonitorIcon, MoonIcon, RefreshCwIcon, SunIcon, XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Switch } from "@/components/ui/switch.js";
import { useAbacus } from "../context.js";
import type { AgentMode, ReasoningEffort } from "../protocol.js";
import { chooseColorScheme, useColorSchemeChoice, type ColorScheme } from "../useColorScheme.js";
import {
  chooseContentWidth,
  useContentWidthChoice,
  type ContentWidth,
} from "../useContentWidth.js";

export function Settings() {
  const setView = useAbacus((state) => state.setView);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setView("chat");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [setView]);

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pt-6 pb-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <header className="flex items-center justify-between">
          <h1 className="text-[22px] font-medium tracking-tight">Settings</h1>
          <button
            type="button"
            onClick={() => setView("chat")}
            className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
            aria-label="Close settings"
          >
            <XIcon className="size-4" />
          </button>
        </header>
        <Appearance />
        <Agent />
        <Sync />
        <About />
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="abacus-label">{title}</h2>
        {hint ? <p className="text-ui-sm text-foreground-subtlest">{hint}</p> : null}
      </div>
      <div className="flex flex-col divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-ui-base">{label}</span>
        {hint ? <span className="text-ui-sm text-foreground-subtlest">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; icon?: typeof SunIcon }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg bg-background p-0.5" role="radiogroup">
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-ui-sm text-foreground-subtle hover:text-foreground disabled:opacity-50",
            option === value && "bg-card-selected text-foreground shadow-sm",
          )}
        >
          {Icon ? <Icon className="size-3.5" /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}

const SCHEMES: { value: ColorScheme; label: string; icon: typeof SunIcon }[] = [
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

const WIDTHS: { value: ContentWidth; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "wide", label: "Wide" },
  { value: "wider", label: "Wider" },
  { value: "full", label: "Full" },
];

function Appearance() {
  const scheme = useColorSchemeChoice();
  const width = useContentWidthChoice();
  return (
    <Section title="Appearance">
      <Row label="Theme">
        <Segmented value={scheme} options={SCHEMES} onChange={chooseColorScheme} />
      </Row>
      <Row label="Content width" hint="How wide the conversation and composer grow.">
        <Segmented value={width} options={WIDTHS} onChange={chooseContentWidth} />
      </Row>
    </Section>
  );
}

const MODES: { value: AgentMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "plan", label: "Plan" },
  { value: "build", label: "Build" },
];

const EFFORTS: { value: ReasoningEffort | "default"; label: string }[] = [
  { value: "default", label: "Model default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

function Agent() {
  const thread = useAbacus((state) => state.thread);
  const ready = useAbacus((state) => state.phase === "ready");
  const models = useAbacus((state) => state.models);
  const setModel = useAbacus((state) => state.setModel);
  const setMode = useAbacus((state) => state.setMode);
  const setReasoningEffort = useAbacus((state) => state.setReasoningEffort);
  const setAutoApprove = useAbacus((state) => state.setAutoApprove);
  const running = Boolean(thread?.turnId);

  if (!thread || !ready) {
    return (
      <Section title="Agent" hint="Open a project to change the model, mode and approvals.">
        <div className="px-4 py-3.5 text-ui-sm text-foreground-subtlest">No project open.</div>
      </Section>
    );
  }

  return (
    <Section title="Agent" hint="Saved to your abacus profile, so the terminal uses them too.">
      <Row label="Model" hint={running ? "Change it between turns." : undefined}>
        <Select
          value={thread.model}
          onValueChange={(value) => void setModel(value)}
          disabled={running || models.length === 0}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {(models.some((entry) => entry.id === thread.model)
              ? models
              : [{ id: thread.model, selected: true }, ...models]
            ).map((entry) => (
              <SelectItem key={entry.id} value={entry.id} className="font-mono text-ui-sm">
                {entry.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Reasoning effort">
        <Select
          value={thread.reasoningEffort ?? "default"}
          onValueChange={(value) =>
            void setReasoningEffort(value === "default" ? null : (value as ReasoningEffort))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EFFORTS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row
        label="Mode"
        hint="Plan investigates without changing anything; Build goes straight to changes."
      >
        <Segmented value={thread.mode} options={MODES} onChange={(mode) => void setMode(mode)} />
      </Row>
      <Row
        label="Approve tools automatically"
        hint="Commands and edits run without asking, for this session."
      >
        <Switch
          checked={thread.autoApprove}
          onCheckedChange={(on) => void setAutoApprove(on)}
          className="data-unchecked:bg-foreground/15"
        />
      </Row>
    </Section>
  );
}

function Sync() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!window.abacus) return;
    setLoading(true);
    try {
      setStatus(await window.abacus.syncStatus());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Section
      title="Abacus Sync"
      hint={
        <>
          Sessions sync across your devices when signed in. Sign in or out with{" "}
          <code className="font-mono">abacus sync login</code> and{" "}
          <code className="font-mono">abacus sync logout</code> in a terminal.
        </>
      }
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-ui-sm leading-relaxed whitespace-pre-wrap text-foreground-subtle">
          {status ?? "Checking…"}
        </pre>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md p-1.5 text-foreground-subtle hover:bg-hover hover:text-foreground"
          aria-label="Refresh sync status"
        >
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>
    </Section>
  );
}

function About() {
  const appInfo = useAbacus((state) => state.appInfo);
  const cli = useAbacus((state) => state.cli);
  const serverVersion = useAbacus((state) => state.serverVersion);
  const link = (url: string, label: string) => (
    <button
      type="button"
      onClick={() => void window.abacus?.openExternal(url)}
      className="text-brand hover:underline"
    >
      {label}
    </button>
  );

  return (
    <Section title="About">
      <Row label="Abacus desktop">
        <span className="font-mono text-ui-sm text-foreground-subtle">
          {appInfo?.version ?? "—"}
        </span>
      </Row>
      <Row label="abacus CLI" hint={cli && cli.state !== "missing" ? cli.path : undefined}>
        <span className="font-mono text-ui-sm text-foreground-subtle">
          {cli?.state === "missing" ? "not installed" : (serverVersion ?? cli?.version ?? "—")}
        </span>
      </Row>
      <div className="flex gap-4 px-4 py-3.5 text-ui-sm">
        {link("https://abacus.empero.org", "abacus.empero.org")}
        {link("https://github.com/empero-org/abacus", "Source")}
      </div>
    </Section>
  );
}
