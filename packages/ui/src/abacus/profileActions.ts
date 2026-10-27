// The window's actions on profiles and providers: switch, add, change and
// remove them, and list a provider's models. Each takes what the app server
// answers as what is now true, rather than guessing.

import type { AbacusBridge } from "./bridge.js";
import type { ConfigValueResult, ModelCardEntry, ProfileEntry, ProviderEntry } from "./protocol.js";
import type { AbacusState } from "./state.js";

type Get = () => AbacusState;
type Set = (partial: Partial<AbacusState>) => void;

interface Helpers {
  /** Runs an action, showing its failure as a notice. */
  guard(work: () => Promise<void>): Promise<void>;
  /** As `guard`, for an action whose result the caller goes on with; null on failure. */
  attempt<T>(work: () => Promise<T>): Promise<T | null>;
  /** Takes the session's profile, model and mode as the app server reports them. */
  applyConfig(result: ConfigValueResult): void;
  refreshProfiles(): Promise<void>;
  /** Why an action failed, in words for the person. */
  errorMessage(error: unknown): string;
}

type ProfileActions = Pick<
  AbacusState,
  | "selectProfile"
  | "saveProfile"
  | "removeProfile"
  | "saveProvider"
  | "removeProvider"
  | "providerModels"
>;

export function profileActions(
  bridge: AbacusBridge,
  get: Get,
  set: Set,
  { guard, attempt, applyConfig, refreshProfiles, errorMessage }: Helpers,
): ProfileActions {
  return {
    selectProfile: (name) =>
      guard(async () => {
        applyConfig(await bridge.request<ConfigValueResult>("profile/select", { name }));
        await refreshProfiles();
      }),

    saveProfile: (draft) =>
      attempt(async () => {
        const result = await bridge.request<{
          name: string;
          profiles: ProfileEntry[];
          state: ConfigValueResult;
        }>("profile/save", draft);
        set({ profiles: result.profiles });
        applyConfig(result.state);
        return result.name;
      }),

    removeProfile: (name) =>
      guard(async () => {
        const { profiles } = await bridge.request<{ profiles: ProfileEntry[] }>("profile/remove", {
          name,
        });
        set({ profiles });
        await refreshProfiles();
      }),

    saveProvider: (draft) =>
      attempt(async () => {
        const { id } = await bridge.request<{ id: string; provider: ProviderEntry }>(
          "provider/save",
          draft,
        );
        // Its models may have changed with its address or key.
        const { [id]: _stale, ...catalogs } = get().catalogs;
        set({ catalogs });
        await refreshProfiles();
        return id;
      }),

    removeProvider: (id) =>
      guard(async () => {
        const { providers } = await bridge.request<{ providers: ProviderEntry[] }>(
          "provider/remove",
          { id },
        );
        const { [id]: _gone, ...catalogs } = get().catalogs;
        set({ providers, catalogs });
        await refreshProfiles();
      }),

    async providerModels(id, refresh = false) {
      try {
        const { models } = await bridge.request<{ models: ModelCardEntry[] }>("provider/models", {
          id,
          refresh,
        });
        set({
          catalogs: { ...get().catalogs, [id]: models },
          providers: get().providers.map((provider) =>
            provider.id === id ? { ...provider, modelCount: models.length } : provider,
          ),
        });
        return { models, error: null };
      } catch (error) {
        return { models: get().catalogs[id] ?? [], error: errorMessage(error) };
      }
    },
  };
}
