import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// LLM access for the AI analyst. Nothing here runs unless the user configures a provider.
//
//   AI_PROVIDER=anthropic   → Claude via the official SDK (ANTHROPIC_API_KEY; paid, pay-as-you-go)
//   AI_PROVIDER=groq | gemini | openrouter | ollama | openai-compatible
//                           → any OpenAI-compatible chat endpoint (AI_API_KEY, AI_MODEL; several
//                             have free tiers — see README). AI_BASE_URL overrides the endpoint.
//
// Keys are read server-side only and never sent to the browser.

export type Provider = "anthropic" | "groq" | "gemini" | "openrouter" | "ollama" | "openai-compatible";

const BASE_URLS: Record<Exclude<Provider, "anthropic">, string> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
  "openai-compatible": "",
};

export interface AiConfig {
  provider: Provider;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
}

export type AiConfigResult = { ok: true; config: AiConfig } | { ok: false; reason: string };

export function aiConfig(): AiConfigResult {
  const p = (process.env.AI_PROVIDER ?? "").trim().toLowerCase() as Provider | "";
  if (!p) return { ok: false, reason: "No AI provider configured. Set AI_PROVIDER in .env.local (see README → AI analyst)." };
  if (p === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return { ok: false, reason: "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set." };
    return { ok: true, config: { provider: p, model: process.env.AI_MODEL?.trim() || "claude-opus-5-5", baseUrl: null, apiKey: key } };
  }
  if (!(p in BASE_URLS)) return { ok: false, reason: `Unknown AI_PROVIDER "${p}". Use anthropic, groq, gemini, openrouter, ollama or openai-compatible.` };
  const baseUrl = process.env.AI_BASE_URL?.trim() || BASE_URLS[p as Exclude<Provider, "anthropic">];
  if (!baseUrl) return { ok: false, reason: "AI_PROVIDER=openai-compatible needs AI_BASE_URL." };
  const model = process.env.AI_MODEL?.trim();
  if (!model) return { ok: false, reason: `AI_MODEL is required for ${p}. Pick a model from the provider's current model list.` };
  const apiKey = process.env.AI_API_KEY?.trim() || null;
  if (!apiKey && p !== "ollama") return { ok: false, reason: `AI_PROVIDER=${p} needs AI_API_KEY.` };
  return { ok: true, config: { provider: p as Provider, model, baseUrl, apiKey } };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export class AiError extends Error {}

export async function complete(cfg: AiConfig, system: string, messages: ChatTurn[]): Promise<string> {
  if (cfg.provider === "anthropic") return completeAnthropic(cfg, system, messages);
  return completeOpenAiCompatible(cfg, system, messages);
}

async function completeAnthropic(cfg: AiConfig, system: string, messages: ChatTurn[]): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey!, timeout: 90_000, maxRetries: 1 });
  try {
    const usesFallbacks = /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(cfg.model);
    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages,
      ...(usesFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") throw new AiError("The model declined to answer this question.");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new AiError("The model returned an empty answer.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Anthropic rejected the API key (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Anthropic rate limit reached. Try again in a minute.");
    if (e instanceof Anthropic.NotFoundError) throw new AiError(`Model "${cfg.model}" was not found. Check AI_MODEL.`);
    if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${e.status ?? ""}: ${e.message}`.trim());
    throw new AiError(`Could not reach Anthropic: ${(e as Error).message}`);
  }
}

async function completeOpenAiCompatible(cfg: AiConfig, system: string, messages: ChatTurn[]): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${cfg.baseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: "system", content: system }, ...messages] }),
      signal: ctrl.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      // Never echo the request (it contains the key in headers); a short status is enough.
      if (res.status === 401 || res.status === 403) throw new AiError(`${cfg.provider} rejected the API key (AI_API_KEY).`);
      if (res.status === 429) throw new AiError(`${cfg.provider} rate limit or free-tier quota reached. Try again later.`);
      if (res.status === 404) throw new AiError(`${cfg.provider} returned 404 — check AI_MODEL ("${cfg.model}") and AI_BASE_URL.`);
      throw new AiError(`${cfg.provider} returned HTTP ${res.status}.`);
    }
    let text = "";
    try {
      const j = JSON.parse(body);
      text = String(j?.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      throw new AiError(`${cfg.provider} returned a response that wasn't JSON.`);
    }
    if (!text) throw new AiError(`${cfg.provider} returned an empty answer.`);
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error).name === "AbortError") throw new AiError(`${cfg.provider} timed out after 90 seconds.`);
    throw new AiError(`Could not reach ${cfg.provider}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- rate limiting (per server process) ----------

const hits: number[] = [];
export function allowRequest(limitPerMinute = 15): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= limitPerMinute) return false;
  hits.push(now);
  return true;
}
