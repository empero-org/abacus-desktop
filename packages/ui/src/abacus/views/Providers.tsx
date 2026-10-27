// Providers, as Settings lists and edits them: an API connection, with its
// address, its key, and whatever else it needs (headers, body fields, a token
// command), all in one place.

import { useState } from "react";
import { LoaderCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { PROTOCOLS, headersLine, plural } from "../profiles.js";
import type { PresetEntry, Protocol, ProviderDraft, ProviderEntry } from "../protocol.js";
import { Advanced, Field } from "./Form.js";

export function ProviderList() {
  const providers = useAbacus((state) => state.providers);
  // A provider's id, or "" for a new one.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {providers.map((provider) =>
        editing === provider.id ? (
          <ProviderEditor key={provider.id} provider={provider} onDone={() => setEditing(null)} />
        ) : (
          <ProviderRow
            key={provider.id}
            provider={provider}
            onEdit={() => setEditing(provider.id)}
          />
        ),
      )}
      {editing === "" ? (
        <ProviderEditor onDone={() => setEditing(null)} />
      ) : (
        <div className="px-4 py-3">
          <Button variant="outline" onClick={() => setEditing("")}>
            <PlusIcon />
            Add provider
          </Button>
        </div>
      )}
    </>
  );
}

function ProviderRow({ provider, onEdit }: { provider: ProviderEntry; onEdit: () => void }) {
  const removeProvider = useAbacus((state) => state.removeProvider);
  const [confirming, setConfirming] = useState(false);
  const facts = [
    provider.modelCount !== null ? plural(provider.modelCount, "model") : null,
    provider.profiles.length ? plural(provider.profiles.length, "profile") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2 text-ui-base">
          {provider.name}
          {provider.name.toLowerCase() !== provider.id ? (
            <span className="font-mono text-ui-sm text-foreground-subtlest">{provider.id}</span>
          ) : null}
        </span>
        <span className="truncate font-mono text-ui-sm text-foreground-subtlest">
          {provider.baseUrl}
        </span>
        <span
          className={cn(
            "text-ui-sm",
            provider.keyMissing ? "text-warning" : "text-foreground-subtlest",
          )}
        >
          Key: {provider.key}
          {facts ? ` · ${facts}` : ""}
        </span>
      </div>
      {confirming ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void removeProvider(provider.id).finally(() => setConfirming(false))}
          >
            {provider.profiles.length
              ? `Remove with ${plural(provider.profiles.length, "profile")}`
              : "Remove"}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={onEdit}
            aria-label={`Edit ${provider.name}`}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${provider.name}`}
          >
            <Trash2Icon />
          </Button>
        </>
      )}
    </div>
  );
}

interface ProviderForm {
  /** For a new provider: the preset it starts from, or "" for a custom one. */
  preset: string;
  name: string;
  baseUrl: string;
  protocol: Protocol;
  apiKey: string;
  apiKeyEnv: string;
  authHeader: string;
  authFormat: string;
  tokenCommand: string;
  headers: string;
  body: string;
  remove: string;
  systemPrefix: string;
  requestUrl: string;
  modelsUrl: string;
  models: string;
}

const EMPTY_FORM: ProviderForm = {
  preset: "",
  name: "",
  baseUrl: "",
  protocol: "chat-completions",
  apiKey: "",
  apiKeyEnv: "",
  authHeader: "",
  authFormat: "",
  tokenCommand: "",
  headers: "",
  body: "",
  remove: "",
  systemPrefix: "",
  requestUrl: "",
  modelsUrl: "",
  models: "",
};

function formFor(provider: ProviderEntry): ProviderForm {
  return {
    preset: "",
    name: provider.name,
    baseUrl: provider.baseUrl,
    protocol: provider.protocol,
    apiKey: "",
    apiKeyEnv: provider.apiKeyEnv ?? "",
    authHeader: provider.authHeader ?? "",
    authFormat: provider.authFormat ?? "",
    tokenCommand: provider.tokenCommand,
    headers: headersLine(provider.headers),
    body: provider.body,
    remove: provider.remove.join(", "),
    systemPrefix: provider.systemPrefix ?? "",
    requestUrl: provider.requestUrl ?? "",
    modelsUrl: provider.modelsUrl ?? "",
    models: provider.models.join(", "),
  };
}

function formForPreset(preset: PresetEntry): ProviderForm {
  return {
    ...EMPTY_FORM,
    preset: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    protocol: preset.protocol,
    apiKeyEnv: preset.keyVariable ?? "",
  };
}

/** What `provider/save` is sent for a form: every field, and the key only when typed. */
function providerDraft(form: ProviderForm, id?: string): ProviderDraft {
  const { preset, apiKey, ...fields } = form;
  return {
    ...(id ? { id } : preset ? { preset } : {}),
    ...fields,
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  };
}

/** Add a provider, or change one: everything about the connection, in one place. */
function ProviderEditor({
  provider,
  onDone,
}: {
  provider?: ProviderEntry;
  onDone: (id: string | null) => void;
}) {
  const presets = useAbacus((state) => state.presets);
  const saveProvider = useAbacus((state) => state.saveProvider);
  const providerModels = useAbacus((state) => state.providerModels);
  const [form, setForm] = useState<ProviderForm>(() =>
    provider ? formFor(provider) : presets[0] ? formForPreset(presets[0]) : EMPTY_FORM,
  );
  const [busy, setBusy] = useState(false);
  const set = (field: keyof ProviderForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const text = (field: keyof ProviderForm, placeholder?: string, mono = true) => (
    <Input
      value={form[field]}
      onChange={(event) => set(field)(event.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(mono && "font-mono text-ui-sm")}
    />
  );
  const preset = presets.find((entry) => entry.id === form.preset);

  const save = async () => {
    setBusy(true);
    const id = await saveProvider(providerDraft(form, provider?.id));
    setBusy(false);
    if (!id) return;
    onDone(id);
    // List its models again, which also shows whether it still connects.
    void providerModels(id);
  };

  const forgetKey = async () => {
    if (!provider) return;
    setBusy(true);
    await saveProvider({ id: provider.id, apiKey: "" });
    setBusy(false);
  };

  return (
    <form
      className="flex flex-col gap-4 bg-background/40 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {provider ? null : (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Start from">
          {[...presets, null].map((entry) => {
            const id = entry?.id ?? "";
            return (
              <button
                key={id || "custom"}
                type="button"
                role="radio"
                aria-checked={form.preset === id}
                onClick={() => setForm(entry ? formForPreset(entry) : EMPTY_FORM)}
                className={cn(
                  "rounded-full border px-3 py-1 text-ui-sm text-foreground-subtle hover:text-foreground",
                  form.preset === id && "border-brand/60 bg-selected text-foreground",
                )}
              >
                {entry?.name ?? "Custom"}
              </button>
            );
          })}
        </div>
      )}
      {preset ? <p className="-mt-1 text-ui-sm text-foreground-subtlest">{preset.hint}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">{text("name", "My provider", false)}</Field>
        <Field label="Protocol">
          <Select value={form.protocol} onValueChange={set("protocol")}>
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
        <Field label="Base URL" className="col-span-2">
          {text("baseUrl", "https://api.example.com/v1")}
        </Field>
        <Field
          label="API key"
          hint={
            provider
              ? `Now: ${provider.key}. Leave empty to keep it.`
              : preset?.keyFound
                ? `${preset.keyVariable} is set, so this can stay empty.`
                : preset?.local
                  ? "Usually none for a server on this machine."
                  : undefined
          }
        >
          <Input
            type="password"
            value={form.apiKey}
            onChange={(event) => set("apiKey")(event.target.value)}
            placeholder={provider?.hasStoredKey ? "••••••••" : "Paste a key"}
            autoComplete="off"
            className="font-mono text-ui-sm"
          />
        </Field>
        <Field label="Or read it from" hint="An environment variable, checked first.">
          {text("apiKeyEnv", "PROVIDER_API_KEY")}
        </Field>
      </div>
      <Advanced>
        <Field label="Headers" hint="Sent with every request." className="col-span-2">
          {text("headers", "HTTP-Referer: https://example.com; X-Title: abacus")}
        </Field>
        <Field label="Body fields" hint="JSON merged into every request." className="col-span-2">
          {text("body", '{"store": false}')}
        </Field>
        <Field label="Auth header" hint="Where the key goes.">
          {text("authHeader", "Authorization")}
        </Field>
        <Field label="Auth format" hint="{key} is replaced by the key.">
          {text("authFormat", "Bearer {key}")}
        </Field>
        <Field
          label="Token command"
          hint="Prints a key each time one is needed."
          className="col-span-2"
        >
          {text("tokenCommand", "pass show api/provider")}
        </Field>
        <Field label="Remove fields" hint="Body fields this API rejects, comma separated.">
          {text("remove", "temperature, top_p")}
        </Field>
        <Field label="System prompt prefix">{text("systemPrefix", "", false)}</Field>
        <Field label="Request URL" hint="Instead of the base URL's chat endpoint.">
          {text("requestUrl")}
        </Field>
        <Field label="Models URL" hint="Where its model list is.">
          {text("modelsUrl")}
        </Field>
        <Field
          label="Models"
          hint="For an API with no model list, comma separated."
          className="col-span-2"
        >
          {text("models", "model-a, model-b")}
        </Field>
      </Advanced>
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={busy || !form.baseUrl.trim()}>
          {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
          {provider ? "Save" : "Add provider"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <div className="flex-1" />
        {provider?.hasStoredKey ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void forgetKey()}
            disabled={busy}
            className="text-foreground-subtle"
          >
            Forget the stored key
          </Button>
        ) : null}
      </div>
    </form>
  );
}
