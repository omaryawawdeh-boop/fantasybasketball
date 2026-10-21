// Defensive accessors for untrusted JSON. External payloads are `unknown` until proven otherwise;
// these helpers return null instead of throwing so one odd field never breaks a whole list.

export type J = unknown;

export function obj(v: J): Record<string, J> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, J>) : null;
}

export function arr(v: J): J[] {
  return Array.isArray(v) ? v : [];
}

export function str(v: J): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function num(v: J): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function bool(v: J): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Walk a path like get(x, "a", 0, "b"). */
export function get(v: J, ...path: (string | number)[]): J {
  let cur: J = v;
  for (const p of path) {
    if (cur == null) return null;
    if (typeof p === "number") cur = Array.isArray(cur) ? cur[p] : null;
    else cur = obj(cur)?.[p] ?? null;
  }
  return cur ?? null;
}

export function isoDate(v: J): string | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Map items with a per-item try/catch; malformed items are dropped and counted. */
export function mapSafe<A, B>(items: A[], fn: (a: A) => B | null): { out: B[]; dropped: number } {
  const out: B[] = [];
  let dropped = 0;
  for (const it of items) {
    try {
      const r = fn(it);
      if (r != null) out.push(r);
      else dropped++;
    } catch {
      dropped++;
    }
  }
  return { out, dropped };
}

export function parseJson(raw: string): J {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("not valid JSON");
  }
}

/** "6-14" → [6, 14]. */
export function madeAttempted(v: J): [number, number] {
  const s = str(v);
  if (!s) return [0, 0];
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}
