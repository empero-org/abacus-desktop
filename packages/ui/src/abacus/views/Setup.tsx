// First run: abacus has no provider yet, so before the first turn the window
// connects one. Three steps, the ones `abacus setup` asks in the terminal:
// where the models come from, the key if it needs one, and the model to start
// with. Everything else has a default and lives in Settings.

import { useState } from "react";
import {
  ArrowLeftIcon,
  KeyRoundIcon,
  LaptopIcon,
  LoaderCircleIcon,
  ServerIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useAbacus } from "../context.js";
import { PROTOCOLS } from "../profiles.js";
import type { PresetEntry, Protocol, ProviderDraft } from "../protocol.js";
import { BrandMark } from "./BrandMark.js";
import { Field } from "./Form.js";
import { ModelPicker } from "./ModelPicker.js";

type Step =
  | { kind: "provider" }
  // `id` once the provider is saved, so trying again changes it rather than adding another.
  | { kind: "connect"; preset: PresetEntry | null; id: string | null }
  | { kind: "model"; id: string; back: Step | null };

export function Setup() {
  const [step, setStep] = useState<Step>({ kind: "provider" });

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pt-[10vh] pb-12">
      <div className="flex w-full max-w-xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <BrandMark className="size-8 text-foreground" />
          <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-balance">
            {step.kind === "model" ? "Choose a model" : "Connect a model provider"}
          </h1>
          <p className="text-ui-lg text-foreground-subtle">
            {step.kind === "model"
              ? "The one abacus starts with. It becomes a profile you can change, or add to, in Settings."
              : "abacus works with any OpenAI- or Anthropic-compatible API. Pick where your models come from; more can be added later in Settings."}
          </p>
        </header>
        {step.kind === "provider" ? (
          <ChooseProvider
            onPreset={(preset) => setStep({ kind: "connect", preset, id: null })}
            onExisting={(id) => setStep({ kind: "model", id, back: { kind: "provider" } })}
          />
        ) : step.kind === "connect" ? (
          <Connect
            preset={step.preset}
            id={step.id}
            onBack={() => setStep({ kind: "provider" })}
            onSaved={(id) => setStep({ kind: "connect", preset: step.preset, id })}
            onConnected={(id) =>
              setStep({ kind: "model", id, back: { kind: "connect", preset: step.preset, id } })
            }
          />
        ) : (
          <ChooseModel id={step.id} onBack={step.back ? () => setStep(step.back!) : undefined} />
        )}
      </div>
    </div>
  );
}

function ChooseProvider({
  onPreset,
  onExisting,
}: {
  onPreset: (preset: PresetEntry | null) => void;
  onExisting: (id: string) => void;
}) {
  const presets = useAbacus((state) => state.presets);
  const providers = useAbacus((state) => state.providers);

  return (
    <div className="flex flex-col gap-6">
      {providers.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <span className="abacus-label">Continue with</span>
          <div className="flex flex-col">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => onExisting(provider.id)}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover"
              >
                <span className="text-ui-base">{provider.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-ui-sm text-foreground-subtlest">
                  {provider.baseUrl}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="grid grid-cols-2 gap-2.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPreset(preset)}
            className="flex flex-col items-start gap-1.5 rounded-xl border bg-card px-4 py-3.5 text-left hover:border-brand/40 hover:bg-hover"
          >
            <span className="flex items-center gap-2 text-ui-base font-medium">
              {preset.local ? (
                <LaptopIcon className="size-4 text-foreground-subtle" />
              ) : (
                <ServerIcon className="size-4 text-foreground-subtle" />
              )}
              {preset.name}
            </span>
            <span className="text-ui-sm text-foreground-subtle">{preset.hint}</span>
            {preset.keyFound ? (
              <span className="flex items-center gap-1 text-ui-sm text-success">
                <KeyRoundIcon className="size-3" />
                {preset.keyVariable} found
              </span>
            ) : preset.local ? (
              <span className="text-ui-sm text-foreground-subtlest">Runs on this machine</span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPreset(null)}
          className="flex flex-col items-start gap-1.5 rounded-xl border border-dashed px-4 py-3.5 text-left hover:border-brand/40 hover:bg-hover"
        >
          <span className="text-ui-base font-medium">Another API</span>
          <span className="text-ui-sm text-foreground-subtle">
            Any OpenAI-compatible or Anthropic endpoint, by its URL
          </span>
        </button>
      </section>
    </div>
  );
}

function Connect({
  preset,
  id,
  onBack,
  onSaved,
  onConnected,
}: {
  preset: PresetEntry | null;
  id: string | null;
  onBack: () => void;
  onSaved: (id: string) => void;
  onConnected: (id: string) => void;
}) {
  const saveProvider = useAbacus((state) => state.saveProvider);
  const providerModels = useAbacus((state) => state.providerModels);
  const [name, setName] = useState(preset?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl ?? "");
  const [protocol, setProtocol] = useState<Protocol>(preset?.protocol ?? "chat-completions");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const needsKey = Boolean(preset && !preset.local && !preset.keyFound);
  const ready = baseUrl.trim() !== "" && (!needsKey || apiKey.trim() !== "" || id !== null);

  const connect = async () => {
    setBusy(true);
    setProblem(null);
    const draft: ProviderDraft = {
      ...(id ? { id } : preset ? { preset: preset.id } : {}),
      ...(preset ? {} : { name: name.trim() || "Custom", protocol }),
      baseUrl: baseUrl.trim(),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    const saved = await saveProvider(draft);
    if (!saved) return setBusy(false);
    onSaved(saved);
    // Listing its models is the check that the address and key work.
    const { error } = await providerModels(saved, true);
    setBusy(false);
    if (error) setProblem(error);
    else onConnected(saved);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) void connect();
      }}
    >
      {preset ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My API"
            />
          </Field>
          <Field label="Protocol">
            <Select value={protocol} onValueChange={(value) => setProtocol(value as Protocol)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROTOCOLS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <Field
        label="Base URL"
        hint={
          preset?.local
            ? `Start ${preset.name} first; abacus lists the models it serves.`
            : undefined
        }
      >
        <Input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
          autoFocus={!needsKey}
          className="font-mono text-ui-sm"
        />
      </Field>
      {preset?.local ? null : (
        <Field
          label={needsKey ? "API key" : "API key (optional)"}
          hint={
            preset?.keyFound
              ? `${preset.keyVariable} is set, so there is nothing to paste.`
              : preset?.keyVariable
                ? `Kept in ~/.abacus/credentials.toml. Or export ${preset.keyVariable} instead.`
                : "Kept in ~/.abacus/credentials.toml."
          }
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={id && needsKey ? "Saved; paste another to replace it" : "Paste a key"}
            autoComplete="off"
            autoFocus={needsKey}
            className="font-mono text-ui-sm"
          />
        </Field>
      )}
      {problem ? (
        <p className="rounded-lg border border-destructive/30 px-3 py-2 text-ui-sm text-destructive">
          It did not list its models: {problem}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="lg" variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
        <div className="flex-1" />
        {problem && id ? (
          <Button type="button" size="lg" variant="outline" onClick={() => onConnected(id)}>
            Type a model id instead
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={busy || !ready}>
          {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
          Connect
        </Button>
      </div>
    </form>
  );
}

function ChooseModel({ id, onBack }: { id: string; onBack?: () => void }) {
  const saveProfile = useAbacus((state) => state.saveProfile);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    // Named after its model; the window leaves setup once it is active.
    await saveProfile({ model: `${id}/${model}`, select: true });
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <ModelPicker provider={id} value={model} onChange={setModel} autoFocus />
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button type="button" size="lg" variant="ghost" onClick={onBack} className="gap-1.5">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-right font-mono text-ui-sm text-foreground-subtle",
            !model && "invisible",
          )}
        >
          {id}/{model}
        </span>
        <Button size="lg" onClick={() => void start()} disabled={busy || !model}>
          {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
          Start
        </Button>
      </div>
    </div>
  );
}
