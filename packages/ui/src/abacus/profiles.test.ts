import { describe, expect, it } from "vitest";
import type { ModelCardEntry, ProfileEntry } from "./protocol.js";
import {
  filterModels,
  headersLine,
  modelFacts,
  parseTokens,
  profileFacts,
  splitRef,
  tokensLabel,
} from "./profiles.js";

function card(model: string, extra: Partial<ModelCardEntry> = {}): ModelCardEntry {
  return {
    id: `openrouter/${model}`,
    model,
    name: null,
    contextLength: null,
    maxOutputTokens: null,
    inputCost: null,
    outputCost: null,
    vision: false,
    reasoning: false,
    ...extra,
  };
}

describe("model references", () => {
  it("splits on the first slash only", () => {
    expect(splitRef("openrouter/openai/gpt-5")).toEqual({
      provider: "openrouter",
      model: "openai/gpt-5",
    });
    expect(splitRef("llama/qwen-3-4b")).toEqual({ provider: "llama", model: "qwen-3-4b" });
    expect(splitRef("bare")).toEqual({ provider: "", model: "bare" });
  });
});

describe("labels", () => {
  it("quotes windows the way the terminal does", () => {
    expect(tokensLabel(128_000)).toBe("128k");
    expect(tokensLabel(1_000_000)).toBe("1m");
    expect(tokensLabel(1_048_576)).toBe("1.05m");
    expect(tokensLabel(4096)).toBe("4k");
    expect(tokensLabel(512)).toBe("512");
  });

  it("says what a profile changes, and nothing at its defaults", () => {
    const profile: ProfileEntry = {
      name: "big",
      model: "kojo/kojo",
      provider: "kojo",
      active: true,
      contextWindow: 1_000_000,
      maxOutputTokens: 8_000,
      reasoningEffort: "high",
      toolFormat: null,
      roles: { aux: "llama/qwen-3-4b" },
    };
    expect(profileFacts(profile)).toBe("1m ctx · 8k out · high · 1 role");
    expect(
      profileFacts({
        ...profile,
        contextWindow: null,
        maxOutputTokens: null,
        reasoningEffort: null,
        roles: {},
      }),
    ).toBe("");
  });

  it("prices a model per million tokens", () => {
    expect(modelFacts(card("a", { contextLength: 200_000, inputCost: 3, outputCost: 15 }))).toBe(
      "200k ctx · $3/15",
    );
    expect(modelFacts(card("b", { inputCost: 0, outputCost: 0 }))).toBe("free");
    expect(modelFacts(card("c"))).toBe("");
  });

  it("writes headers as one editable line", () => {
    expect(headersLine({ "HTTP-Referer": "https://x.dev", "X-Title": "abacus" })).toBe(
      "HTTP-Referer: https://x.dev; X-Title: abacus",
    );
    expect(headersLine({})).toBe("");
  });
});

describe("filtering models", () => {
  const models = [
    card("anthropic/claude-sonnet-4.5", { name: "Claude Sonnet 4.5" }),
    card("openai/gpt-5"),
    card("meta/llama-3-70b"),
    card("openai/gpt-5-mini"),
  ];

  it("keeps everything for an empty query", () => {
    expect(filterModels(models, " ")).toHaveLength(4);
  });

  it("needs every word, and ranks ids led by the first word first", () => {
    expect(filterModels(models, "gpt mini").map((entry) => entry.model)).toEqual([
      "openai/gpt-5-mini",
    ]);
    expect(filterModels(models, "sonnet").map((entry) => entry.model)).toEqual([
      "anthropic/claude-sonnet-4.5",
    ]);
    expect(filterModels(models, "gpt").map((entry) => entry.model)).toEqual([
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ]);
  });
});

describe("token counts as typed", () => {
  it("reads plain numbers and k/m suffixes", () => {
    expect(parseTokens("128k")).toBe(128_000);
    expect(parseTokens("1M")).toBe(1_000_000);
    expect(parseTokens("1.5m")).toBe(1_500_000);
    expect(parseTokens("200_000")).toBe(200_000);
    expect(parseTokens("  ")).toBe("");
    expect(parseTokens("lots")).toBeNull();
  });
});
