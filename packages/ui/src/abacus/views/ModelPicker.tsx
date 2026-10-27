// A provider's models to pick from: searchable, with what each costs and how
// much it reads, and a model id typed as is for a provider that lists none.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAbacus } from "../context.js";
import { filterModels, modelFacts, plural } from "../profiles.js";

export function ModelPicker({
  provider,
  value,
  onChange,
  autoFocus,
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  autoFocus?: boolean;
}) {
  const catalog = useAbacus((state) => state.catalogs[provider]);
  const providerModels = useAbacus((state) => state.providerModels);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!provider) return;
      setLoading(true);
      const result = await providerModels(provider, refresh);
      setError(result.error);
      setLoading(false);
    },
    [provider, providerModels],
  );

  useEffect(() => {
    setError(null);
    if (provider && !catalog) void load(false);
    // Only a new provider asks again; a list already here stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const models = catalog ?? [];
  const shown = useMemo(() => filterModels(models, query).slice(0, 200), [models, query]);
  const typed = query.trim();
  const listed = models.some((card) => card.model === typed);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={models.length ? `Search ${plural(models.length, "model")}` : "Model id"}
          spellCheck={false}
          autoFocus={autoFocus}
          className="font-mono text-ui-sm"
          aria-label="Search models"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-md"
          onClick={() => void load(true)}
          disabled={loading || !provider}
          aria-label="Fetch the model list again"
        >
          {loading ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
        </Button>
      </div>
      {error ? <p className="text-ui-sm text-destructive">{error}</p> : null}
      <div
        role="listbox"
        aria-label="Models"
        className="flex max-h-64 flex-col overflow-y-auto rounded-lg border bg-background py-1"
      >
        {shown.map((card) => (
          <button
            key={card.id}
            type="button"
            role="option"
            aria-selected={card.model === value}
            onClick={() => onChange(card.model)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-hover",
              card.model === value && "bg-selected",
            )}
          >
            <CheckIcon className={cn("size-3.5 shrink-0", card.model !== value && "invisible")} />
            <span className="min-w-0 flex-1 truncate font-mono text-ui-sm">{card.model}</span>
            <span className="shrink-0 text-ui-sm text-foreground-subtlest">{modelFacts(card)}</span>
          </button>
        ))}
        {typed && !listed ? (
          <button
            type="button"
            role="option"
            aria-selected={value === typed}
            onClick={() => onChange(typed)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-hover",
              value === typed && "bg-selected",
            )}
          >
            <CheckIcon className={cn("size-3.5 shrink-0", value !== typed && "invisible")} />
            <span className="min-w-0 flex-1 truncate text-ui-sm">
              Use <span className="font-mono">{typed}</span> as typed
            </span>
          </button>
        ) : null}
        {loading && !models.length ? (
          <p className="px-3 py-2 text-ui-sm text-foreground-subtlest">Asking for its models…</p>
        ) : !typed && !shown.length ? (
          <p className="px-3 py-2 text-ui-sm text-foreground-subtlest">
            No models listed. Type a model id above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
