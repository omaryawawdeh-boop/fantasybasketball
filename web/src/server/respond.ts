import "server-only";
import type { SourceMeta } from "@/lib/types";

export function ok<T>(data: T, meta: SourceMeta[]) {
  return Response.json({ data, meta }, { headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export const isId = (s: string) => /^\d{1,12}$/.test(s);
