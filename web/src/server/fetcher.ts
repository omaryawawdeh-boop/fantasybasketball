import "server-only";
import type { DataMode, SourceMeta } from "@/lib/types";
import { readFixture } from "./fixtures/index";

// All outbound requests go through here. Responsibilities:
//  - timeouts and one retry for transient failures
//  - an in-memory TTL cache with stale fallback (serve last good copy when the source fails)
//  - de-duplication of concurrent identical requests
//  - per-provider status for the Data sources page
//  - demo mode: serve bundled fixtures instead of the network, always labeled "demo"
//
// DATA_MODE:
//   auto (default) — live; if a provider has NEVER succeeded in this process and has no cache,
//                    fall back to labeled demo fixtures so the app is still explorable offline.
//   live           — never use demo data; failures show as unavailable.
//   demo           — always use fixtures (used by tests and for offline exploration).

export type Mode = "auto" | "live" | "demo";

export function dataMode(): Mode {
  const m = (process.env.DATA_MODE ?? "auto").toLowerCase();
  return m === "live" || m === "demo" ? m : "auto";
}

interface Entry {
  value: unknown;
  storedAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_CACHE = 600;

interface ProviderStatus {
  provider: string;
  lastSuccess: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastMode: DataMode | null;
  requests: number;
  failures: number;
}

const status = new Map<string, ProviderStatus>();

function stat(provider: string): ProviderStatus {
  let s = status.get(provider);
  if (!s) {
    s = { provider, lastSuccess: null, lastError: null, lastErrorAt: null, lastMode: null, requests: 0, failures: 0 };
    status.set(provider, s);
  }
  return s;
}

export function providerStatuses(): ProviderStatus[] {
  return [...status.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

const USER_AGENT = "HardwoodWire/0.1 (personal, non-commercial NBA reader)";

export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function fetchOnce(url: string, accept: string, timeoutMs: number, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: accept, ...(init?.headers ?? {}) },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status);
    const text = await res.text();
    if (text.length > 8_000_000) throw new FetchError("Response too large");
    return text;
  } catch (e) {
    if (e instanceof FetchError) throw e;
    const msg = (e as Error).name === "AbortError" ? `Timed out after ${timeoutMs}ms` : (e as Error).message || "Network error";
    throw new FetchError(msg);
  } finally {
    clearTimeout(timer);
  }
}

export interface Fetched<T> {
  value: T;
  meta: SourceMeta;
}

export interface GetOptions<T> {
  provider: string;
  url: string;
  /** Key of the bundled demo fixture, or null if there is none. */
  fixture: string | null;
  ttlMs: number;
  /** Parses and validates the raw text. Throwing marks the response malformed. */
  parse: (raw: string) => T;
  accept?: string;
  timeoutMs?: number;
}

/** Fetch + parse with caching and graceful degradation. Never throws; returns null value when unavailable. */
export async function getCached<T>(o: GetOptions<T>): Promise<Fetched<T | null>> {
  const mode = dataMode();
  const s = stat(o.provider);
  const key = `${o.provider}|${o.url}`;

  if (mode === "demo") return demo(o, s, "Demo mode (DATA_MODE=demo)");

  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAt < o.ttlMs) {
    return { value: hit.value as T, meta: { provider: o.provider, mode: "live", fetchedAt: new Date(hit.storedAt).toISOString() } };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  const p =
    existing ??
    (async () => {
      s.requests++;
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await fetchOnce(o.url, o.accept ?? "application/json", o.timeoutMs ?? 8000);
          return o.parse(raw);
        } catch (e) {
          lastErr = e;
          // Don't retry client errors (404, 403, 429) or malformed payloads.
          if (e instanceof FetchError && e.status && e.status < 500) break;
          if (!(e instanceof FetchError)) break;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      throw lastErr;
    })();
  if (!existing) inflight.set(key, p);
  try {
    const value = await p;
    const now = Date.now();
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, storedAt: now });
    s.lastSuccess = new Date(now).toISOString();
    s.lastMode = "live";
    return { value, meta: { provider: o.provider, mode: "live", fetchedAt: s.lastSuccess } };
  } catch (e) {
    const msg = e instanceof FetchError ? e.message : `Malformed response: ${(e as Error).message}`;
    s.failures++;
    s.lastError = msg;
    s.lastErrorAt = new Date().toISOString();
    if (hit) {
      s.lastMode = "cached";
      return {
        value: hit.value as T,
        meta: { provider: o.provider, mode: "cached", fetchedAt: new Date(hit.storedAt).toISOString(), error: msg },
      };
    }
    if (mode === "auto" && !s.lastSuccess) return demo(o, s, msg);
    s.lastMode = "unavailable";
    return { value: null, meta: { provider: o.provider, mode: "unavailable", fetchedAt: s.lastSuccess, error: msg } };
  } finally {
    if (!existing) inflight.delete(key);
  }
}

async function demo<T>(o: GetOptions<T>, s: ProviderStatus, why: string): Promise<Fetched<T | null>> {
  const raw = o.fixture ? await readFixture(o.fixture) : null;
  if (raw == null) {
    s.lastMode = "unavailable";
    return { value: null, meta: { provider: o.provider, mode: "unavailable", fetchedAt: null, error: why } };
  }
  try {
    const value = o.parse(raw);
    s.lastMode = "demo";
    return { value, meta: { provider: o.provider, mode: "demo", fetchedAt: null, error: why } };
  } catch (e) {
    s.lastMode = "unavailable";
    return { value: null, meta: { provider: o.provider, mode: "unavailable", fetchedAt: null, error: `Fixture invalid: ${(e as Error).message}` } };
  }
}

/** Simple concurrency limiter for fan-out requests (e.g. 30 team rosters). */
export async function mapLimit<A, B>(items: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Testing hook. */
export function _resetFetcher() {
  cache.clear();
  inflight.clear();
  status.clear();
}
