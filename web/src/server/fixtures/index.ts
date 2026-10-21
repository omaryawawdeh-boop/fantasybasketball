import "server-only";

// Reads DEMO fixtures (see scripts/make-fixtures.mjs) and resolves relative-time placeholders:
//   {{t:N}}       ISO timestamp N minutes from now
//   {{r:N}}       RFC-822 timestamp N minutes from now (RSS pubDate)
//   {{d:N}}       YYYY-MM-DD, N days from today (US Eastern)
//   {{g:N:HHMM}}  ISO timestamp for HH:MM US Eastern, N days from today

export async function readFixture(key: string): Promise<string | null> {
  const { FIXTURES } = await import("./data");
  const raw = FIXTURES[key];
  return raw == null ? null : resolvePlaceholders(raw, new Date());
}

function etParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute) };
}

/** UTC instant at which US Eastern wall-clock reads y-m-d hh:mm. */
export function easternToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  let guess = Date.UTC(y, m - 1, d, hh + 5, mm);
  for (let i = 0; i < 3; i++) {
    const p = etParts(new Date(guess));
    const diff = Date.UTC(y, m - 1, d, hh, mm) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function resolvePlaceholders(raw: string, now: Date): string {
  const today = etParts(now);
  const dayShift = (n: number) => {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + n));
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() };
  };
  return raw.replace(/\{\{([trdg]):(-?\d+)(?::(\d{4}))?\}\}/g, (_, kind: string, n: string, hhmm?: string) => {
    const k = Number(n);
    if (kind === "t") return new Date(now.getTime() + k * 60_000).toISOString();
    if (kind === "r") return new Date(now.getTime() + k * 60_000).toUTCString();
    const s = dayShift(k);
    if (kind === "d") return `${s.y}-${String(s.m).padStart(2, "0")}-${String(s.d).padStart(2, "0")}`;
    return easternToUtc(s.y, s.m, s.d, Number(hhmm!.slice(0, 2)), Number(hhmm!.slice(2))).toISOString();
  });
}
