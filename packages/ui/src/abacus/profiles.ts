// What the provider and profile editors show and send, as pure functions over
// the app server's rows: a model reference split into its provider and model,
// a window quoted the way the terminal quotes it, a model list filtered as
// the person types, and the one-line forms headers take.

import type { ModelCardEntry, ProfileEntry, Protocol, ReasoningEffort } from "./protocol.js";

export const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "chat-completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
  { value: "anthropic", label: "Anthropic Messages" },
];

/** `1 model`, `3 models`. */
export function plural(count: number, one: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${one}s`;
}

/** `openrouter/openai/gpt-5` → provider `openrouter`, model `openai/gpt-5`. */
export function splitRef(reference: string): { provider: string; model: string } {
  const slash = reference.indexOf("/");
  if (slash === -1) return { provider: "", model: reference };
  return { provider: reference.slice(0, slash), model: reference.slice(slash + 1) };
}

/** `128k`, `1m`, `1.05m`, `4096`: the scale a context window is quoted at. */
export function tokensLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(2))}m`;
  if (tokens >= 1_000) return `${Math.floor(tokens / 1_000)}k`;
  return String(tokens);
}

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** What sets a profile apart from the defaults: `1m ctx · 8k out · high`. */
export function profileFacts(profile: ProfileEntry): string {
  const facts: string[] = [];
  if (profile.contextWindow) facts.push(`${tokensLabel(profile.contextWindow)} ctx`);
  if (profile.maxOutputTokens) facts.push(`${tokensLabel(profile.maxOutputTokens)} out`);
  if (profile.reasoningEffort) facts.push(EFFORT_LABELS[profile.reasoningEffort].toLowerCase());
  const roles = Object.keys(profile.roles).length;
  if (roles) facts.push(roles === 1 ? "1 role" : `${roles} roles`);
  return facts.join(" · ");
}

/**
 * The models matching what was typed: every word must appear in the id or
 * the name, and ids that start with the first word come first. The order
 * the provider gave is kept otherwise.
 */
export function filterModels(models: ModelCardEntry[], query: string): ModelCardEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return models;
  const haystack = (card: ModelCardEntry) => `${card.model} ${card.name ?? ""}`.toLowerCase();
  const matching = models.filter((card) => words.every((word) => haystack(card).includes(word)));
  const first = words[0]!;
  const leads = (card: ModelCardEntry) =>
    card.model.toLowerCase().startsWith(first) || card.model.toLowerCase().includes(`/${first}`);
  return [...matching.filter(leads), ...matching.filter((card) => !leads(card))];
}

/** A model's facts beside its name: `200k ctx · $3/15`. */
export function modelFacts(card: ModelCardEntry): string {
  const facts: string[] = [];
  if (card.contextLength) facts.push(`${tokensLabel(card.contextLength)} ctx`);
  if (card.inputCost !== null && card.outputCost !== null) {
    facts.push(
      card.inputCost === 0 && card.outputCost === 0
        ? "free"
        : `$${price(card.inputCost)}/${price(card.outputCost)}`,
    );
  }
  return facts.join(" · ");
}

function price(value: number): string {
  return String(Number(value.toPrecision(3)));
}

/** Headers as the one line the app server reads back: `Name: value; Other: value`. */
export function headersLine(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
}

/**
 * A token count as typed: `128k`, `1m`, `200000`, or empty for "detect".
 * Null when it is not one; the app server has the last word either way.
 */
export function parseTokens(text: string): number | "" | null {
  const value = text.trim().toLowerCase().replace(/[_,]/g, "");
  if (!value) return "";
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(value);
  if (!match) return null;
  const scale = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return Math.round(Number(match[1]) * scale);
}

/** The jobs a profile can hand to another model, and what each falls back to. */
export const ROLES: { id: string; label: string; help: string; fallback: string }[] = [
  {
    id: "aux",
    label: "Auxiliary model",
    help: "Background calls: prompt refinement, drift checks, page extraction.",
    fallback: "the profile's model",
  },
  {
    id: "review",
    label: "Safety reviewer",
    help: "Judges, in Auto mode, whether an action is what you asked for.",
    fallback: "the auxiliary model",
  },
  {
    id: "subagent",
    label: "Subagent model",
    help: "Delegated agents, when the delegating call names no model.",
    fallback: "the profile's model",
  },
  {
    id: "compaction",
    label: "Compaction model",
    help: "The rolling summary of a long session; worth keeping on a capable model.",
    fallback: "the profile's model",
  },
];
