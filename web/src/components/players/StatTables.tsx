"use client";

import type { GameLogEntry, SeasonLine } from "@/lib/types";
import { fmt, fmtPct, STAT_HELP, type Summary } from "@/lib/stats";

export function AveragesGrid({ s, label }: { s: Summary; label: string }) {
  const cells: [string, string, string?][] = [
    ["PTS", fmt(s.perGame.pts)],
    ["REB", fmt(s.perGame.reb)],
    ["AST", fmt(s.perGame.ast)],
    ["STL", fmt(s.perGame.stl)],
    ["BLK", fmt(s.perGame.blk)],
    ["TOV", fmt(s.perGame.tov)],
    ["MIN", fmt(s.perGame.min)],
    ["FG%", fmtPct(s.fgPct)],
    ["3P%", fmtPct(s.tpPct)],
    ["FT%", fmtPct(s.ftPct)],
    ["TS%", fmtPct(s.tsPct), STAT_HELP.tsPct],
    ["eFG%", fmtPct(s.efgPct), STAT_HELP.efgPct],
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {label} · {s.gp} game{s.gp === 1 ? "" : "s"} · per game
      </p>
      <dl className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {cells.map(([k, v, help]) => (
          <div key={k} className="rounded-md bg-surface-2 px-2 py-1.5" title={help}>
            <dt className="text-[11px] text-faint">
              {k}
              {help && <span aria-hidden> ⓘ</span>}
            </dt>
            <dd className="tabular text-base font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function GameLogTable({ games }: { games: GameLogEntry[] }) {
  if (!games.length) return <p className="text-sm text-muted">No games in the log for this season yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">Game log, most recent first</caption>
        <thead className="text-[11px] uppercase text-faint">
          <tr>
            {["Date", "Opp", "Result", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG", "3P", "FT"].map((h) => (
              <th key={h} scope="col" className={`px-2 py-1.5 ${h === "Date" || h === "Opp" || h === "Result" ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.gameId} className="border-t border-line">
              <td className="whitespace-nowrap px-2 py-1">{new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
              <td className="whitespace-nowrap px-2">
                {g.homeAway === "away" ? "@" : "vs"} {g.opponent}
              </td>
              <td className="whitespace-nowrap px-2 text-muted">{g.result ?? "—"}</td>
              {[g.min, g.pts, g.reb, g.ast, g.stl, g.blk, g.tov].map((v, i) => (
                <td key={i} className="tabular px-2 text-right">
                  {v}
                </td>
              ))}
              <td className="tabular whitespace-nowrap px-2 text-right">
                {g.fgm}-{g.fga}
              </td>
              <td className="tabular whitespace-nowrap px-2 text-right">
                {g.tpm}-{g.tpa}
              </td>
              <td className="tabular whitespace-nowrap px-2 text-right">
                {g.ftm}-{g.fta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CareerTable({ rows }: { rows: SeasonLine[] }) {
  if (!rows.length) return <p className="text-sm text-muted">Career statistics unavailable from the source.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <caption className="px-3 py-2 text-left text-xs text-muted">Regular season, per-game averages by season (source: ESPN)</caption>
        <thead className="text-[11px] uppercase text-faint">
          <tr>
            {["Season", "Team", "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG%", "3P%", "FT%"].map((h) => (
              <th key={h} scope="col" className={`px-2 py-1.5 ${h === "Season" || h === "Team" ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`} className="border-t border-line">
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                {r.season}
              </th>
              <td className="px-2">{r.team ?? "—"}</td>
              <td className="tabular px-2 text-right">{r.gp ?? "—"}</td>
              {(["min", "pts", "reb", "ast", "stl", "blk", "tov"] as const).map((k) => (
                <td key={k} className="tabular px-2 text-right">
                  {fmt(r.stats[k])}
                </td>
              ))}
              {(["fgPct", "tpPct", "ftPct"] as const).map((k) => (
                <td key={k} className="tabular px-2 text-right">
                  {fmtPct(r.stats[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
