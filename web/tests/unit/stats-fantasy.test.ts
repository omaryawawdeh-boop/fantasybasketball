import { describe, expect, it } from "vitest";
import type { GameLogEntry } from "@/lib/types";
import { espnSeasonYear, seasonLabelFor, seasonLabelFromEspnYear, selectGames, summarize } from "@/lib/stats";
import { categoryZ, DEFAULT_FANTASY, fantasyPoints, isDoubleDouble, isTripleDouble, outlook } from "@/lib/fantasy";

const g = (d: number, p: Partial<GameLogEntry> = {}): GameLogEntry => ({
  gameId: `g${d}`,
  date: new Date(Date.UTC(2026, 9, d)).toISOString(),
  opponent: "BOS",
  homeAway: "home",
  result: null,
  seasonType: "regular",
  min: 30,
  pts: 20,
  reb: 5,
  oreb: 1,
  ast: 5,
  stl: 1,
  blk: 1,
  tov: 2,
  pf: 2,
  fgm: 8,
  fga: 16,
  tpm: 2,
  tpa: 6,
  ftm: 2,
  fta: 2,
  ...p,
});

describe("stats", () => {
  it("per-game, totals, per-36 and shooting rates", () => {
    const s = summarize([g(1), g(2, { pts: 30, min: 40, fgm: 12, fga: 20, tpm: 4, tpa: 8, ftm: 2, fta: 4 })]);
    expect(s.gp).toBe(2);
    expect(s.totals.pts).toBe(50);
    expect(s.perGame.pts).toBe(25);
    expect(s.per36!.pts).toBeCloseTo((50 / 70) * 36);
    expect(s.fgPct).toBeCloseTo(20 / 36);
    // TS% = PTS / (2 × (FGA + 0.44 × FTA))
    expect(s.tsPct).toBeCloseTo(50 / (2 * (36 + 0.44 * 6)));
    // eFG% = (FGM + 0.5 × 3PM) / FGA
    expect(s.efgPct).toBeCloseTo((20 + 0.5 * 6) / 36);
  });

  it("no games → null rates, not zeros or NaN", () => {
    const s = summarize([]);
    expect(s.gp).toBe(0);
    expect(s.fgPct).toBeNull();
    expect(s.tsPct).toBeNull();
    expect(s.per36).toBeNull();
  });

  it("windows: last N (newest first), date range, regular season only by default, skips 0-minute games", () => {
    const log = [g(1), g(2), g(3, { seasonType: "playoffs" }), g(4, { min: 0 }), g(5)];
    expect(selectGames(log, { kind: "lastN", n: 2 }).map((x) => x.gameId)).toEqual(["g5", "g2"]);
    expect(selectGames(log, { kind: "range", from: "2026-10-02", to: "2026-10-05" }).map((x) => x.gameId)).toEqual(["g5", "g2"]);
    expect(selectGames(log, { kind: "all", includePlayoffs: true })).toHaveLength(4);
  });

  it("season labels: Oct 2026 is the 2026-27 season (ESPN year 2027)", () => {
    expect(seasonLabelFor(new Date("2026-10-21"))).toBe("2026-27");
    expect(seasonLabelFor(new Date("2027-03-01"))).toBe("2026-27");
    expect(espnSeasonYear(new Date("2026-10-21"))).toBe(2027);
    expect(seasonLabelFromEspnYear(2027)).toBe("2026-27");
  });
});

describe("fantasy", () => {
  it("points with double-double / triple-double bonuses", () => {
    const w = DEFAULT_FANTASY.weights; // FGM 2, FTM 1, 3PM 1, REB 1, AST 1, STL 3, BLK 3, TO -1, DD 3, TD 5
    const line = g(1, { pts: 20, reb: 10, ast: 10, fgm: 8, ftm: 2, tpm: 2, stl: 1, blk: 1, tov: 2 });
    expect(isDoubleDouble(line)).toBe(true);
    expect(isTripleDouble(line)).toBe(true);
    expect(fantasyPoints(line, w)).toBe(8 * 2 + 2 + 2 + 10 + 10 + 3 + 3 - 2 + 3 + 5);
  });

  it("projection: blended form × scheduled games, zero games when OUT, none with <3 games", () => {
    const log = Array.from({ length: 10 }, (_, i) => g(i + 1));
    const o = outlook(log, DEFAULT_FANTASY, 3, false);
    const fp = fantasyPoints(g(1), DEFAULT_FANTASY.weights);
    expect(o.projection!.perGame).toBeCloseTo(fp);
    expect(o.projection!.total).toBeCloseTo(fp * 3);
    expect(outlook(log, DEFAULT_FANTASY, 3, true).projection!.total).toBe(0);
    expect(outlook(log.slice(0, 2), DEFAULT_FANTASY, 3, false).projection).toBeNull();
    expect(outlook(log, DEFAULT_FANTASY, null, false).projection).toBeNull();
  });

  it("category z-scores need a pool of 3+ and punish turnovers", () => {
    const line = (pts: number, tov: number) => ({ pts, reb: 5, ast: 5, stl: 1, blk: 1, tpm: 2, tov, fgm: 8, fga: 16, ftm: 2, fta: 2 });
    expect(categoryZ({ a: line(20, 2), b: line(10, 2) }, ["pts"])).toBeNull();
    const z = categoryZ({ a: line(30, 1), b: line(20, 2), c: line(10, 5) }, ["pts", "tov"])!;
    expect(z.a.total).toBeGreaterThan(z.b.total);
    expect(z.c.byCat.tov!).toBeLessThan(0);
  });
});
