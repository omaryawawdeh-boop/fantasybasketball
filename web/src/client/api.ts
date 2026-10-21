"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { SourceMeta } from "@/lib/types";

// Data fetching for the UI. SWR de-duplicates identical requests across components, keeps the
// last good data while revalidating, and ignores responses for keys that are no longer current
// (so a slow old search can't overwrite a newer one).

export interface Envelope<T> {
  data: T;
  meta: SourceMeta[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      throw new ApiError("The server returned an unreadable response.", res.status);
    }
    if (!res.ok) throw new ApiError((body as { error?: string })?.error ?? `Request failed (${res.status})`, res.status);
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("The request timed out.", 0);
    throw new ApiError("Network error — check your connection.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function useApi<T>(url: string | null, opts: SWRConfiguration = {}) {
  const r = useSWR<Envelope<T>, ApiError>(url, fetchJson, {
    revalidateOnFocus: false,
    keepPreviousData: false,
    errorRetryCount: 2,
    ...opts,
  });
  return { data: r.data?.data, meta: r.data?.meta ?? [], error: r.error, isLoading: r.isLoading, isValidating: r.isValidating, mutate: r.mutate };
}
