// Profiles, as Settings lists and edits them: one `provider/model` with the
// settings it runs with (limits, effort, and the models its roles use).

import { useState } from "react";
import { LoaderCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import {
  EFFORT_LABELS,
  ROLES,
  parseTokens,
  profileFacts,
  splitRef,
  tokensLabel,
} from "../profiles.js";
import type { ProfileDraft, ProfileEntry, ReasoningEffort } from "../protocol.js";
import { Advanced, Field } from "./Form.js";
import { ModelPicker } from "./ModelPicker.js";

const EFFORTS = ["default", ...(Object.keys(EFFORT_LABELS) as ReasoningEffort[])] as const;

export function ProfileList() {
  const profiles = useAbacus((state) => state.profiles);
  const providers = useAbacus((state) => state.providers);
  // A profile's name, or "" for a new one.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {profiles.map((profile) =>
        editing === profile.name ? (
          <ProfileEditor key={profile.name} profile={profile} onDone={() => setEditing(null)} />
        ) : (
          <ProfileRow
            key={profile.name}
            profile={profile}
            onEdit={() => setEditing(profile.name)}
          />
        ),
      )}
      {editing === "" ? (
        <ProfileEditor onDone={() => setEditing(null)} />
      ) : (
        <div className="px-4 py-3">
          <Button
            variant="outline"
            onClick={() => setEditing("")}
            disabled={providers.length === 0}
            title={providers.length === 0 ? "Add a provider first" : undefined}
          >
            <PlusIcon />
            New profile
          </Button>
        </div>
      )}
    </>
  );
}

function ProfileRow({ profile, onEdit }: { profile: ProfileEntry; onEdit: () => void }) {
  const selectProfile = useAbacus((state) => state.selectProfile);
  const removeProfile = useAbacus((state) => state.removeProfile);
  const running = useAbacus((state) => Boolean(state.thread?.turnId));
  const only = useAbacus((state) => state.profiles.length === 1);
  const [confirming, setConfirming] = useState(false);
  const facts = profileFacts(profile);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-ui-base">
          {profile.name}
          {profile.active ? (
            <span className="rounded-full bg-selected px-2 py-px text-ui-sm text-foreground-subtle">
              In use
            </span>
          ) : null}
        </span>
        {profile.model !== profile.name ? (
          <span className="truncate font-mono text-ui-sm text-foreground-subtlest">
            {profile.model}
          </span>
        ) : null}
        {facts ? <span className="text-ui-sm text-foreground-subtlest">{facts}</span> : null}
      </div>
      {confirming ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void removeProfile(profile.name).finally(() => setConfirming(false))}
          >
            Remove
          </Button>
        </>
      ) : (
        <>
          {profile.active ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void selectProfile(profile.name)}
              disabled={running}
              title={running ? "Switch between turns" : undefined}
            >
              Use
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-md"
            onClick={onEdit}
            aria-label={`Edit ${profile.name}`}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() => setConfirming(true)}
            disabled={only}
            title={only ? "The only profile stays" : undefined}
            aria-label={`Remove ${profile.name}`}
          >
            <Trash2Icon />
          </Button>
        </>
      )}
    </div>
  );
}

/** A new profile, or one to change: its model, name, limits, effort and roles. */
function ProfileEditor({
  profile,
  onDone,
}: {
  profile?: ProfileEntry;
  onDone: (name: string | null) => void;
}) {
  const providers = useAbacus((state) => state.providers);
  const saveProfile = useAbacus((state) => state.saveProfile);
  const start = splitRef(profile?.model ?? "");
  const [provider, setProvider] = useState(start.provider || providers[0]?.id || "");
  const [model, setModel] = useState(start.model);
  const [name, setName] = useState(profile?.name ?? "");
  const [context, setContext] = useState(
    profile?.contextWindow ? String(profile.contextWindow) : "",
  );
  const [output, setOutput] = useState(
    profile?.maxOutputTokens ? String(profile.maxOutputTokens) : "",
  );
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]>(
    profile?.reasoningEffort ?? "default",
  );
  const [roles, setRoles] = useState<Record<string, string>>(profile?.roles ?? {});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useAbacus((state) =>
    state.catalogs[provider]?.find((entry) => entry.model === model),
  );
  const reference = provider && model ? `${provider}/${model}` : "";

  const save = async () => {
    const contextWindow = parseTokens(context);
    const maxOutputTokens = parseTokens(output);
    if (contextWindow === null || maxOutputTokens === null) {
      setProblem("Token counts are numbers like 128000, 128k or 1m.");
      return;
    }
    setProblem(null);
    const draft: ProfileDraft = {
      ...(profile ? { previousName: profile.name } : {}),
      ...(name.trim() ? { name: name.trim() } : {}),
      model: reference,
      contextWindow: contextWindow === "" ? null : contextWindow,
      maxOutputTokens: maxOutputTokens === "" ? null : maxOutputTokens,
      reasoningEffort: effort === "default" ? null : effort,
      roles: Object.fromEntries(ROLES.map((role) => [role.id, roles[role.id]?.trim() ?? ""])),
    };
    setBusy(true);
    const saved = await saveProfile(draft);
    setBusy(false);
    if (saved) onDone(saved);
  };

  return (
    <form
      className="flex flex-col gap-4 bg-background/40 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3">
        <Field label="Provider">
          <Select
            value={provider}
            onValueChange={(value) => {
              setProvider(value);
              setModel("");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" hint={profile ? undefined : "Left empty, it is named after its model."}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={reference || "provider/model"}
            spellCheck={false}
          />
        </Field>
      </div>
      <Field label={reference ? `Model: ${reference}` : "Model"}>
        <ModelPicker provider={provider} value={model} onChange={setModel} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Context window">
          <Input
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder={
              card?.contextLength ? `Detect (${tokensLabel(card.contextLength)})` : "Detect"
            }
            className="font-mono text-ui-sm"
          />
        </Field>
        <Field label="Max output tokens">
          <Input
            value={output}
            onChange={(event) => setOutput(event.target.value)}
            placeholder={
              card?.maxOutputTokens ? `Default (${tokensLabel(card.maxOutputTokens)})` : "Default"
            }
            className="font-mono text-ui-sm"
          />
        </Field>
        <Field label="Reasoning effort">
          <Select value={effort} onValueChange={(value) => setEffort(value as typeof effort)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORTS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry === "default" ? "Model default" : EFFORT_LABELS[entry]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Advanced>
        {ROLES.map((role) => (
          <Field key={role.id} label={role.label} hint={role.help}>
            <Input
              value={roles[role.id] ?? ""}
              onChange={(event) => setRoles({ ...roles, [role.id]: event.target.value })}
              placeholder={`Same as ${role.fallback}`}
              spellCheck={false}
              className="font-mono text-ui-sm"
            />
          </Field>
        ))}
      </Advanced>
      {problem ? <p className="text-ui-sm text-destructive">{problem}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={busy || !reference}>
          {busy ? <LoaderCircleIcon className="animate-spin" /> : null}
          {profile ? "Save" : "Create profile"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
