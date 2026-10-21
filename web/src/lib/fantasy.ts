import type { GameLogEntry } from "./types";
import { mean, selectGames, stdDev } from "./stats";

// Configurable fantasy scoring. Points leagues use weights; category leagues use z-scores
// computed within the pool of players being compared.

export type WeightKey = "pts" | "reb" | "oreb" | "ast" | "stl" | "blk" | "tov" | "fgm" | "fga" | "ftm" | "fta" | "tpm" | "dd" | "td";

export const WEIGHT_LABEL: Record<WeightKey, string> = {
  pts: "Points",
  reb: "Rebounds",
  oreb: "Off. rebounds",
  ast: "Assists",
  stl: "Steals",
  blk: "Blocks",
  tov: "Turnovers",
  fgm: "FG made",
  fga: "FG attempted",
  ftm: "FT made",
  fta: "FT attempted",
  tpm: "3PT made",
  dd: "Double-double",
  td: "Triple-double",
};

export type CategoryKey = "pts" | "reb" | "ast" | "stl" | "blk" | "tpm" | "fgPct" | "ftPct" | "tov";

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  tpm: "3PM",
  fgPct: "FG%",
  ftPct: "FT%",
  tov: "TO",
};

export interface FantasyConfig {
  mode: "points" | "categories";
  weights: Record<WeightKey, number>;
  categories: CategoryKey[];
  /** Days ahead used for schedule-based projections. */
  horizonDays: number;
  /** Games used for the "recent form" part of a projection. */
  recentGames: number;
}

const zeroWeights: Record<WeightKey, number> = { pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0, dd: 0, td: 0 };

export const PRESETS: { id: string; label: string; note: string; config: Partial<FantasyConfig> }[] = [
  {
    id: "my-league",
    label: "My league (from tier sheet)",
    note: "FGM 2, FTM 1, 3PM 1, REB 1, AST 1, STL 3, BLK 3, TO −1, DD 3, TD 5 — the scoring noted in your 2025-26 tier sheet.",
    config: { mode: "points", weights: { ...zeroWeights, fgm: 2, ftm: 1, tpm: 1, reb: 1, ast: 1, stl: 3, blk: 3, tov: -1, dd: 3, td: 5 } },
  },
  {
    id: "espn-points",
    label: "ESPN default points",
    note: "PTS 1, 3PM 1, FGA −1, FGM 2, FTA −1, FTM 1, REB 1, AST 2, STL 4, BLK 4, TO −2. Check your league's settings — commissioners often change these.",
    config: { mode: "points", weights: { ...zeroWeights, pts: 1, tpm: 1, fga: -1, fgm: 2, fta: -1, ftm: 1, reb: 1, ast: 2, stl: 4, blk: 4, tov: -2 } },
  },
  {
    id: "9cat",
    label: "9-category roto/H2H",
    note: "PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, TO. Values are z-scores within the players you are comparing.",
    config: { mode: "categories", categories: ["pts", "reb", "ast", "stl", "blk", "tpm", "fgPct", "ftPct", "tov"] },
  },
];

export const DEFAULT_FANTASY: FantasyConfig = {
  mode: "points",
  weights: PRESETS[0].config.weights!,
  categories: ["pts", "reb", "ast", "stl", "blk", "tpm", "fgPct", "ftPct", "tov"],
  horizonDays: 7,
  recentGames: 10,
};

export function isDoubleDouble(g: GameLogEntry): boolean {
  return [g.pts, g.reb, g.ast, g.stl, g.blk].filter((v) => v >= 10).length >= 2;
}
export function isTripleDouble(g: GameLogEntry): boolean {
  return [g.pts, g.reb, g.ast, g.stl, g.blk].filter((v) => v >= 10).length >= 3;
}

export function fantasyPoints(g: GameLogEntry, w: Record<WeightKey, number>): number {
  return (
    w.pts * g.pts +
    w.reb * g.reb +
    w.oreb * (g.oreb ?? 0) +
    w.ast * g.ast +
    w.stl * g.stl +
    w.blk * g.blk +
    w.tov * g.tov +
    w.fgm * g.fgm +
    w.fga * g.fga +
    w.ftm * g.ftm +
    w.fta * g.fta +
    w.tpm * g.tpm +
    (isDoubleDouble(g) ? w.dd : 0) +
    (isTripleDouble(g) ? w.td : 0)
  );
}

export interface FantasyOutlook {
  season: { gp: number; fpg: number; sd: number; mpg: number };
  recent: { gp: number; fpg: number; mpg: number };
  last5: { gp: number; fpg: number; mpg: number };
  /** Recent FP/G minus season FP/G. */
  trend: number;
  minutesTrend: number;
  projection: {
    games: number;
    perGame: number;
    total: number;
    low: number;
    high: number;
    assumptions: string;
  } | null;
  signal: "hot" | "cold" | "steady" | "insufficient";
}

/**
 * Simple, transparent projection: 60% recent-form FP/G + 40% season FP/G, times scheduled games in
 * the horizon. The range is ±1 standard deviation of single-game FP scaled by √games.
 * Returns null projection when there are fewer than 3 games or no schedule.
 */
export function outlook(log: GameLogEntry[], cfg: FantasyConfig, gamesInHorizon: number | null, statusOut: boolean): FantasyOutlook {
  const all = selectGames(log, { kind: "all" });
  const recent = selectGames(log, { kind: "lastN", n: cfg.recentGames });
  const l5 = selectGames(log, { kind: "lastN", n: 5 });
  const fp = (gs: GameLogEntry[]) => gs.map((g) => fantasyPoints(g, cfg.weights));
  const sFp = fp(all);
  const season = { gp: all.length, fpg: mean(sFp), sd: stdDev(sFp), mpg: mean(all.map((g) => g.min)) };
  const rec = { gp: recent.length, fpg: mean(fp(recent)), mpg: mean(recent.map((g) => g.min)) };
  const last5 = { gp: l5.length, fpg: mean(fp(l5)), mpg: mean(l5.map((g) => g.min)) };
  const trend = rec.fpg - season.fpg;
  const minutesTrend = rec.mpg - season.mpg;
  let signal: FantasyOutlook["signal"] = "insufficient";
  if (all.length >= 6) {
    const thresh = Math.max(2, season.sd * 0.35);
    signal = trend > thresh ? "hot" : trend < -thresh ? "cold" : "steady";
  }
  let projection: FantasyOutlook["projection"] = null;
  if (cfg.mode === "points" && all.length >= 3 && gamesInHorizon != null) {
    const games = statusOut ? 0 : gamesInHorizon;
    const perGame = 0.6 * rec.fpg + 0.4 * season.fpg;
    const spread = season.sd * Math.sqrt(games);
    projection = {
      games,
      perGame,
      total: perGame * games,
      low: Math.max(0, perGame * games - spread),
      high: perGame * games + spread,
      assumptions: statusOut
        ? "Player is listed OUT, so no games are counted. Re-check when the status changes."
        : `${games} scheduled game(s) in the next ${cfg.horizonDays} days; 60% last-${cfg.recentGames} form + 40% season average; range is ±1 SD. Assumes normal minutes and no new injuries.`,
    };
  }
  return { season, recent: rec, last5, trend, minutesTrend, projection, signal };
}

export interface CategoryLine {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
  tov: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
}

/**
 * Z-score value per category within a pool. Percentages are impact-weighted (makes above pool
 * average rate × attempts), turnovers are negated. Pools under 3 players return null — a z-score
 * against one other player isn't meaningful.
 */
export function categoryZ(pool: Record<string, CategoryLine>, cats: CategoryKey[]): Record<string, { total: number; byCat: Partial<Record<CategoryKey, number>> }> | null {
  const ids = Object.keys(pool);
  if (ids.length < 3) return null;
  const lgFg = ids.reduce((a, id) => a + pool[id].fgm, 0) / Math.max(1e-9, ids.reduce((a, id) => a + pool[id].fga, 0));
  const lgFt = ids.reduce((a, id) => a + pool[id].ftm, 0) / Math.max(1e-9, ids.reduce((a, id) => a + pool[id].fta, 0));
  const raw = (id: string, c: CategoryKey): number => {
    const l = pool[id];
    if (c === "fgPct") return l.fgm - lgFg * l.fga;
    if (c === "ftPct") return l.ftm - lgFt * l.fta;
    if (c === "tov") return -l.tov;
    return l[c];
  };
  const out: Record<string, { total: number; byCat: Partial<Record<CategoryKey, number>> }> = {};
  for (const id of ids) out[id] = { total: 0, byCat: {} };
  for (const c of cats) {
    const vals = ids.map((id) => raw(id, c));
    const m = mean(vals);
    const sd = stdDev(vals) || 1;
    ids.forEach((id, i) => {
      const z = (vals[i] - m) / sd;
      out[id].byCat[c] = z;
      out[id].total += z;
    });
  }
  return out;
}
