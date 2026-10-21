"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { GameLogEntry } from "@/lib/types";
import { espnSeasonYear, fmt, fmtPct, seasonLabelFromEspnYear, selectGames, STAT_HELP, summarize, type Summary, type Window } from "@/lib/stats";
import { fantasyPoints } from "@/lib/fantasy";
import { usePlayer, useStandings, type PlayerPayload } from "@/client/data";
import { usePrefs } from "@/client/state";
import { TEAMS } from "@/lib/teams";
import { PlayerPicker } from "@/components/players/PlayerPicker";
import { LineChart, SERIES_COLORS } from "@/components/charts/LineChart";
import { Icon } from "@/components/icons";
import { Card, Chip, cx, DataStatus, DemoNotice, EmptyState, SectionHeader, TeamBadge } from "@/components/ui";

type Mode = "perGame" | "totals" | "per36";

const ROWS: { key: string; label: string; pct?: boolean; lowerBetter?: boolean; help?: string }[] = [
  { key: "min", label: "MIN" },
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TOV", lowerBetter: true },
  { key: "tpm", label: "3PM" },
  { key: "fga", label: "FGA" },
  { key: "fta", label: "FTA" },
  { key: "fgPct", label: "FG%", pct: true },
  { key: "tpPct", label: "3P%", pct: true },
  { key: "ftPct", label: "FT%", pct: true },
  { key: "tsPct", label: "TS%", pct: true, help: STAT_HELP.tsPct },
  { key: "efgPct", label: "eFG%", pct: true, help: STAT_HELP.efgPct },
  { key: "fp", label: "Fantasy pts", help: STAT_HELP.fp },
];

function value(s: Summary, games: GameLogEntry[], key: string, mode: Mode, weights: Parameters<typeof fantasyPoints>[1]): number | null {
  if (["fgPct", "tpPct", "ftPct", "tsPct", "efgPct"].includes(key)) return s[key as "fgPct"];
  if (key === "fp") {
    const tot = games.reduce((a, g) => a + fantasyPoints(g, weights), 0);
    if (!s.gp) return null;
    if (mode === "totals") return tot;
    if (mode === "per36") return s.totals.min ? (tot / s.totals.min) * 36 : null;
    return tot / s.gp;
  }
  const k = key as keyof Summary["perGame"];
  if (!s.gp) return null;
  if (mode === "totals") return s.totals[k];
  if (mode === "per36") return s.per36 ? s.per36[k] : null;
  return s.perGame[k];
}

export default function StatsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const ids = (params.get("players") ?? "").split(",").filter((x) => /^\d+$/.test(x)).slice(0, 4);
  const current = espnSeasonYear(new Date());
  const [season, setSeason] = useState(current);
  const [win, setWin] = useState<Window>({ kind: "all" });
  const [mode, setMode] = useState<Mode>("perGame");
  const [split, setSplit] = useState(false);
  const [chartStat, setChartStat] = useState<"pts" | "reb" | "ast" | "min">("pts");
  const prefs = usePrefs();

  const p0 = usePlayer(ids[0] ?? null, season);
  const p1 = usePlayer(ids[1] ?? null, season);
  const p2 = usePlayer(ids[2] ?? null, season);
  const p3 = usePlayer(ids[3] ?? null, season);
  const loaded = [p0, p1, p2, p3].slice(0, ids.length);
  const idsKey = ids.join(",");

  const setIds = (next: string[]) => {
    const q = new URLSearchParams(params.toString());
    if (next.length) q.set("players", next.join(","));
    else q.delete("players");
    router.replace(`/stats?${q.toString()}`, { scroll: false });
  };

  // Columns: one per player, or (split mode) the first player's window vs the window before it.
  const columns = useMemo(() => {
    const cols: { label: string; sub: string; games: GameLogEntry[]; payload: PlayerPayload | undefined; color: string }[] = [];
    if (split && ids.length >= 1 && loaded[0]?.data) {
      const n = win.kind === "lastN" ? win.n ?? 10 : 10;
      const all = selectGames(loaded[0].data.stats?.log ?? [], { kind: "all" });
      cols.push({ label: loaded[0].data.bio?.name ?? "", sub: `Last ${n} games`, games: all.slice(0, n), payload: loaded[0].data, color: SERIES_COLORS[0] });
      cols.push({ label: loaded[0].data.bio?.name ?? "", sub: `Previous ${n} games`, games: all.slice(n, 2 * n), payload: loaded[0].data, color: SERIES_COLORS[1] });
      return cols;
    }
    loaded.forEach((r, i) => {
      if (!r.data) return;
      cols.push({
        label: r.data.bio?.name ?? `Player ${ids[i]}`,
        sub: win.kind === "all" ? `${seasonLabelFromEspnYear(season)} season` : win.kind === "lastN" ? `Last ${win.n} games` : `${win.from ?? "…"} to ${win.to ?? "…"}`,
        games: selectGames(r.data.stats?.log ?? [], win),
        payload: r.data,
        color: SERIES_COLORS[i],
      });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p0.data, p1.data, p2.data, p3.data, win, split, season, idsKey]);

  const sums = columns.map((c) => summarize(c.games));
  const metas = loaded.flatMap((l) => l.meta);

  return (
    <div className="space-y-6">
      <SectionHeader as="h1" title="Stats & comparisons" right={<DataStatus meta={metas} />} />
      <DemoNotice meta={metas} />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {ids.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-sm">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              <Link href={`/players/${id}`} className="hover:underline">
                {loaded[i]?.data?.bio?.name ?? (loaded[i]?.isLoading ? "Loading…" : `Player ${id}`)}
              </Link>
              <button onClick={() => setIds(ids.filter((x) => x !== id))} aria-label="Remove player" className="text-muted hover:text-text">
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          {ids.length < 4 && (
            <div className="w-64">
              <PlayerPicker onPick={(p) => setIds([...ids, p.id])} exclude={ids} label={ids.length ? "Add another player" : "Pick a player"} />
            </div>
          )}
        </div>
        {prefs.followedPlayers.length > 0 && ids.length < 4 && (
          <p className="text-xs text-muted">
            Quick add:{" "}
            {prefs.followedPlayers
              .filter((p) => !ids.includes(p.id))
              .slice(0, 6)
              .map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <button className="underline hover:text-text" onClick={() => setIds([...ids, p.id])}>
                    {p.name}
                  </button>
                </span>
              ))}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-muted">
            Season
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="rounded border border-line bg-surface-2 px-2 py-1 text-text">
              {Array.from({ length: 6 }, (_, i) => current - i).map((y) => (
                <option key={y} value={y}>
                  {seasonLabelFromEspnYear(y)}
                </option>
              ))}
            </select>
          </label>
          <Chip active={win.kind === "all"} onClick={() => setWin({ kind: "all" })}>
            Full season
          </Chip>
          {[5, 10, 15].map((n) => (
            <Chip key={n} active={win.kind === "lastN" && win.n === n} onClick={() => setWin({ kind: "lastN", n })}>
              Last {n}
            </Chip>
          ))}
          <Chip active={win.kind === "range"} onClick={() => setWin({ kind: "range", from: win.from, to: win.to })}>
            Date range
          </Chip>
          {win.kind === "range" && (
            <span className="flex items-center gap-1">
              <label className="sr-only" htmlFor="st-from">From</label>
              <input id="st-from" type="date" value={win.from ?? ""} onChange={(e) => setWin({ ...win, from: e.target.value })} className="rounded border border-line bg-surface-2 px-1 py-0.5" />
              <span>to</span>
              <label className="sr-only" htmlFor="st-to">To</label>
              <input id="st-to" type="date" value={win.to ?? ""} onChange={(e) => setWin({ ...win, to: e.target.value })} className="rounded border border-line bg-surface-2 px-1 py-0.5" />
            </span>
          )}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          {(["perGame", "totals", "per36"] as const).map((m) => (
            <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
              {m === "perGame" ? "Per game" : m === "totals" ? "Totals" : "Per 36"}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <Chip active={split} onClick={() => setSplit((v) => !v)} label="Compare the first player's recent games with the games before">
            Split: recent vs before
          </Chip>
        </div>
      </Card>

      {ids.length === 0 ? (
        <EmptyState title="Pick players to compare" icon="compare">
          Add up to four players. Compare full seasons, the last N games, or a date range — per game, totals or per 36 minutes.
        </EmptyState>
      ) : columns.length === 0 ? (
        <EmptyState title={loaded.some((l) => l.isLoading) ? "Loading…" : "No statistics available for these players"} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left text-xs text-muted">
                {mode === "perGame" ? "Per game" : mode === "totals" ? "Totals" : "Per 36 minutes"} · regular season only · source: ESPN game logs. Best value in each row is
                highlighted.
              </caption>
              <thead>
                <tr className="text-left text-xs">
                  <th scope="col" className="px-3 py-2 text-faint">
                    Stat
                  </th>
                  {columns.map((c, i) => (
                    <th key={i} scope="col" className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                        {c.label}
                      </span>
                      <span className="block font-normal text-faint">
                        {c.sub} · {sums[i].gp} gp
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const vals = columns.map((c, i) => value(sums[i], c.games, r.key, mode, prefs.fantasy.weights));
                  const show = (v: number | null) => (r.pct ? fmtPct(v) : fmt(v, mode === "totals" && r.key !== "fp" ? 0 : 1));
                  const nums = vals.filter((v): v is number => v != null);
                  // Compare at display precision so visually equal values tie.
                  const bestRaw = nums.length > 1 ? (r.lowerBetter ? Math.min(...nums) : Math.max(...nums)) : null;
                  const best = bestRaw != null ? show(bestRaw) : null;
                  return (
                    <tr key={r.key} className="border-t border-line">
                      <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted" title={r.help}>
                        {r.label}
                        {r.help && <span aria-hidden> ⓘ</span>}
                      </th>
                      {vals.map((v, i) => (
                        <td key={i} className={cx("tabular px-3 text-right", best != null && v != null && show(v) === best && "font-semibold text-accent")}>
                          {show(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {columns.some((c, i) => sums[i].gp > 0 && sums[i].gp < 5) && (
            <p className="text-xs text-warn">Small sample: fewer than 5 games in at least one column. Averages can swing a lot.</p>
          )}
          {split && <p className="text-xs text-muted">Split mode compares the first player&apos;s most recent games with the same number of games immediately before them (regular season).</p>}

          <Card className="p-4">
            <SectionHeader
              title="Game-by-game"
              right={
                <div className="flex gap-1">
                  {(["pts", "reb", "ast", "min"] as const).map((k) => (
                    <Chip key={k} active={chartStat === k} onClick={() => setChartStat(k)}>
                      {k.toUpperCase()}
                    </Chip>
                  ))}
                </div>
              }
            />
            {(() => {
              const n = Math.max(...columns.map((c) => c.games.length));
              if (n < 2) return <p className="text-sm text-muted">Not enough games to chart.</p>;
              return (
                <LineChart
                  title={`${chartStat.toUpperCase()} by game, oldest to newest`}
                  labels={Array.from({ length: n }, (_, i) => `G${i + 1}`)}
                  series={columns.map((c) => {
                    const g = [...c.games].reverse();
                    return { name: `${c.label} (${c.sub})`, color: c.color, values: Array.from({ length: n }, (_, i) => (g[i] ? g[i][chartStat] : null)) };
                  })}
                />
              );
            })()}
            <p className="mt-1 text-[11px] text-faint">Games are aligned by order within each window (G1 = oldest), not by date.</p>
          </Card>
        </>
      )}

      <TeamCompare />

      <Card className="p-4 text-sm text-muted">
        <h2 className="mb-1 font-semibold text-text">What&apos;s not here yet</h2>
        <p>
          Usage rate, on/off splits, PER and historical leaderboards need play-by-play or league-wide data that isn&apos;t available from a free, permitted source in
          this prototype. TS% and eFG% are computed from the box-score totals shown.
        </p>
      </Card>
    </div>
  );
}

function TeamCompare() {
  const { data, meta } = useStandings();
  const [a, setA] = useState("18");
  const [b, setB] = useState("2");
  const rows = data?.standings ?? [];
  const ra = rows.find((r) => r.team.id === a);
  const rb = rows.find((r) => r.team.id === b);
  const stat = (label: string, fa: (r: NonNullable<typeof ra>) => string) => (
    <tr className="border-t border-line">
      <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted">
        {label}
      </th>
      <td className="tabular px-3 text-right">{ra ? fa(ra) : "—"}</td>
      <td className="tabular px-3 text-right">{rb ? fa(rb) : "—"}</td>
    </tr>
  );
  return (
    <section>
      <SectionHeader title="Team comparison" right={<DataStatus meta={meta} />} />
      <div className="mb-2 flex gap-2">
        {[
          [a, setA],
          [b, setB],
        ].map(([v, set], i) => (
          <select key={i} aria-label={`Team ${i + 1}`} value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="rounded border border-line bg-surface px-2 py-1 text-sm">
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ))}
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted">Standings unavailable.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Team comparison from current standings</caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs text-faint">
                  Current season
                </th>
                {[a, b].map((t) => (
                  <th key={t} scope="col" className="px-3 py-2 text-right">
                    <TeamBadge id={t} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stat("Record", (r) => `${r.wins}-${r.losses}`)}
              {stat("Win %", (r) => (r.pct != null ? r.pct.toFixed(3) : "—"))}
              {stat("Conference seed", (r) => `${r.conference} ${r.seed ?? "—"}`)}
              {stat("Points per game", (r) => fmt(r.ppg))}
              {stat("Opp. points per game", (r) => fmt(r.oppPpg))}
              {stat("Point differential", (r) => (r.ppg != null && r.oppPpg != null ? `${r.ppg - r.oppPpg >= 0 ? "+" : ""}${fmt(r.ppg - r.oppPpg)}` : "—"))}
              {stat("Streak", (r) => r.streak ?? "—")}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
