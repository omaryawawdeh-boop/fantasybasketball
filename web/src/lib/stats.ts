import type { GameLogEntry } from "./types";

// Pure statistical helpers over a player's game log. All functions skip games with 0 minutes
// (DNPs) because ESPN logs only include games the player appeared in, but defensive anyway.

export type CountingKey = "min" | "pts" | "reb" | "ast" | "stl" | "blk" | "tov" | "pf" | "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta";

export const COUNTING_KEYS: CountingKey[] = ["min", "pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta"];

export const STAT_LABEL: Record<string, string> = {
  min: "MIN",
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  tov: "TOV",
  pf: "PF",
  fgm: "FGM",
  fga: "FGA",
  tpm: "3PM",
  tpa: "3PA",
  ftm: "FTM",
  fta: "FTA",
  fgPct: "FG%",
  tpPct: "3P%",
  ftPct: "FT%",
  tsPct: "TS%",
  efgPct: "eFG%",
  fp: "FP",
};

export const STAT_HELP: Record<string, string> = {
  tsPct: "True shooting %: PTS / (2 × (FGA + 0.44 × FTA)). Shooting efficiency including 3s and free throws.",
  efgPct: "Effective FG%: (FGM + 0.5 × 3PM) / FGA. Credits a made 3 as 1.5 made 2s.",
  fp: "Fantasy points under your scoring settings (Fantasy → Scoring).",
  per36: "Per 36 minutes: per-game value × 36 / minutes per game. Unreliable for small minute samples.",
};

export interface Window {
  kind: "all" | "lastN" | "range";
  n?: number;
  from?: string;
  to?: string;
  /** Only regular-season games unless set. */
  includePlayoffs?: boolean;
}

export function selectGames(log: GameLogEntry[], w: Window): GameLogEntry[] {
  const games = log
    .filter((g) => g.seasonType === "regular" || (w.includePlayoffs && g.seasonType === "playoffs"))
    .filter((g) => g.min > 0)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (w.kind === "lastN") return games.slice(0, Math.max(0, w.n ?? 10));
  if (w.kind === "range") {
    const from = w.from ? Date.parse(w.from) : -Infinity;
    const to = w.to ? Date.parse(w.to) + 86_399_000 : Infinity;
    return games.filter((g) => {
      const t = Date.parse(g.date);
      return t >= from && t <= to;
    });
  }
  return games;
}

export interface Summary {
  gp: number;
  totals: Record<CountingKey, number>;
  perGame: Record<CountingKey, number>;
  per36: Record<CountingKey, number> | null;
  fgPct: number | null;
  tpPct: number | null;
  ftPct: number | null;
  tsPct: number | null;
  efgPct: number | null;
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function summarize(games: GameLogEntry[]): Summary {
  const totals = Object.fromEntries(COUNTING_KEYS.map((k) => [k, 0])) as Record<CountingKey, number>;
  for (const g of games) for (const k of COUNTING_KEYS) totals[k] += Number.isFinite(g[k]) ? g[k] : 0;
  const gp = games.length;
  const perGame = Object.fromEntries(COUNTING_KEYS.map((k) => [k, gp ? totals[k] / gp : 0])) as Record<CountingKey, number>;
  const per36 =
    totals.min > 0
      ? (Object.fromEntries(COUNTING_KEYS.map((k) => [k, k === "min" ? 36 : (totals[k] / totals.min) * 36])) as Record<CountingKey, number>)
      : null;
  return {
    gp,
    totals,
    perGame,
    per36,
    fgPct: ratio(totals.fgm, totals.fga),
    tpPct: ratio(totals.tpm, totals.tpa),
    ftPct: ratio(totals.ftm, totals.fta),
    tsPct: ratio(totals.pts, 2 * (totals.fga + 0.44 * totals.fta)),
    efgPct: ratio(totals.fgm + 0.5 * totals.tpm, totals.fga),
  };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

/** "2026-27" for a date in the 2026-27 season (Aug–Dec belong to the season starting that year). */
export function seasonLabelFor(d: Date): string {
  const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** ESPN's season year is the year the season ends (2026-27 → 2027). */
export function espnSeasonYear(d: Date): number {
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

export function seasonLabelFromEspnYear(y: number): string {
  return `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}
