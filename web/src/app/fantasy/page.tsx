"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameLogEntry, InjuryEntry, ScheduleGame } from "@/lib/types";
import { CATEGORY_LABEL, categoryZ, outlook, PRESETS, WEIGHT_LABEL, type CategoryKey, type CategoryLine, type FantasyConfig, type WeightKey } from "@/lib/fantasy";
import { fmt, selectGames, summarize } from "@/lib/stats";
import { usePlayer } from "@/client/data";
import { updatePrefs, usePrefs, type FollowedPlayer } from "@/client/state";
import tierSheet from "@/data/tier-sheet-2025-26.json";
import { gamesInNextDays } from "@/components/players/FantasyOutlookCard";
import { PlayerPicker } from "@/components/players/PlayerPicker";
import { Icon } from "@/components/icons";
import { Card, cx, DemoNotice, EmptyState, SectionHeader, TeamBadge } from "@/components/ui";

interface RowData {
  log: GameLogEntry[];
  schedule: ScheduleGame[] | null;
  injury: InjuryEntry | null;
  demo: boolean;
}

export default function FantasyPage() {
  const prefs = usePrefs();
  const cfg = prefs.fantasy;
  const pool = useMemo(() => {
    const m = new Map<string, FollowedPlayer>();
    for (const p of [...prefs.followedPlayers, ...prefs.fantasyPool]) m.set(p.id, p);
    return [...m.values()];
  }, [prefs.followedPlayers, prefs.fantasyPool]);
  const [rows, setRows] = useState<Record<string, RowData>>({});
  const report = useCallback((id: string, d: RowData) => setRows((r) => (r[id] === d ? r : { ...r, [id]: d })), []);
  const setCfg = (patch: Partial<FantasyConfig>) => updatePrefs((p) => ({ fantasy: { ...p.fantasy, ...patch } }));

  const z = useMemo(() => {
    if (cfg.mode !== "categories") return null;
    const lines: Record<string, CategoryLine> = {};
    for (const p of pool) {
      const d = rows[p.id];
      if (!d) continue;
      const s = summarize(selectGames(d.log, { kind: "lastN", n: cfg.recentGames }));
      if (!s.gp) continue;
      const pg = s.perGame;
      lines[p.id] = { pts: pg.pts, reb: pg.reb, ast: pg.ast, stl: pg.stl, blk: pg.blk, tpm: pg.tpm, tov: pg.tov, fgm: pg.fgm, fga: pg.fga, ftm: pg.ftm, fta: pg.fta };
    }
    return categoryZ(lines, cfg.categories);
  }, [cfg, pool, rows]);

  const anyDemo = Object.values(rows).some((r) => r.demo);

  return (
    <div className="space-y-6">
      <SectionHeader as="h1" title="Fantasy center" />
      {anyDemo && <DemoNotice meta={[{ provider: "espn-gamelog", mode: "demo", fetchedAt: null }]} />}

      <Card className="p-4">
        <SectionHeader title="Scoring" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-muted" htmlFor="preset">
            Preset
          </label>
          <select
            id="preset"
            defaultValue=""
            onChange={(e) => {
              const pr = PRESETS.find((p) => p.id === e.target.value);
              if (pr) setCfg(pr.config);
              e.target.value = "";
            }}
            className="rounded border border-line bg-surface-2 px-2 py-1"
          >
            <option value="">Apply a preset…</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <fieldset className="flex gap-3">
            <legend className="sr-only">League type</legend>
            {(["points", "categories"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" name="mode" checked={cfg.mode === m} onChange={() => setCfg({ mode: m })} className="accent-[var(--accent)]" /> {m === "points" ? "Points" : "Categories"}
              </label>
            ))}
          </fieldset>
          <label className="ml-auto flex items-center gap-1 text-muted">
            Form window
            <select value={cfg.recentGames} onChange={(e) => setCfg({ recentGames: Number(e.target.value) })} className="rounded border border-line bg-surface-2 px-2 py-1 text-text">
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  last {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-muted">
            Horizon
            <select value={cfg.horizonDays} onChange={(e) => setCfg({ horizonDays: Number(e.target.value) })} className="rounded border border-line bg-surface-2 px-2 py-1 text-text">
              {[3, 7, 14].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </label>
        </div>
        {cfg.mode === "points" ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(Object.keys(WEIGHT_LABEL) as WeightKey[]).map((k) => (
              <label key={k} className="text-xs text-muted">
                {WEIGHT_LABEL[k]}
                <input
                  type="number"
                  step="0.5"
                  value={cfg.weights[k]}
                  onChange={(e) => setCfg({ weights: { ...cfg.weights, [k]: Number(e.target.value) || 0 } })}
                  className="tabular mt-0.5 block w-full rounded border border-line bg-surface-2 px-2 py-1 text-sm text-text"
                />
              </label>
            ))}
          </div>
        ) : (
          <fieldset className="mt-3 flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-xs text-muted">Categories (uncheck to punt)</legend>
            {(Object.keys(CATEGORY_LABEL) as CategoryKey[]).map((c) => (
              <label key={c} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={cfg.categories.includes(c)}
                  onChange={(e) => setCfg({ categories: e.target.checked ? [...cfg.categories, c] : cfg.categories.filter((x) => x !== c) })}
                  className="accent-[var(--accent)]"
                />
                {CATEGORY_LABEL[c]}
              </label>
            ))}
          </fieldset>
        )}
        <p className="mt-2 text-[11px] text-faint">Saved in this browser. Not connected to any fantasy platform — copy your league&apos;s settings here.</p>
      </Card>

      <section>
        <SectionHeader title="Your player pool" right={<div className="w-64"><PlayerPicker label="Add to pool" exclude={pool.map((p) => p.id)} onPick={(p) => updatePrefs((pr) => ({ fantasyPool: [...pr.fantasyPool, { id: p.id, name: p.name, teamId: p.teamId }] }))} /></div>} />
        {pool.length === 0 ? (
          <EmptyState title="No players yet" icon="trophy">
            Follow players or add them here. The pool combines your watchlist and players you add.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left text-xs text-muted">
                {cfg.mode === "points"
                  ? `Actual fantasy points per game (FP/G) from game logs, plus a ${cfg.horizonDays}-day projection (estimate).`
                  : `Category z-scores over each player's last ${cfg.recentGames} games, relative to this pool (needs 3+ players).`}
              </caption>
              <thead className="text-[11px] uppercase text-faint">
                {cfg.mode === "points" ? (
                  <tr>
                    {["Player", "Status", "GP", "Season", `L${cfg.recentGames}`, "L5", "Trend", "Min Δ", `Games ${cfg.horizonDays}d`, "Projection", ""].map((h, i) => (
                      <th key={i} scope="col" className={cx("px-2 py-1.5", i < 2 ? "text-left" : "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                ) : (
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left">Player</th>
                    {cfg.categories.map((c) => (
                      <th key={c} scope="col" className="px-2 text-right">
                        {CATEGORY_LABEL[c]}
                      </th>
                    ))}
                    <th scope="col" className="px-2 text-right">Total z</th>
                    <th />
                  </tr>
                )}
              </thead>
              <tbody>
                {pool.map((p) => (
                  <PoolRow key={p.id} p={p} cfg={cfg} report={report} z={z?.[p.id] ?? null} zAvailable={!!z} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cfg.mode === "points" && pool.length > 0 && <Signals pool={pool} rows={rows} cfg={cfg} />}

      <Card className="p-4 text-sm">
        <SectionHeader title="Waiver wire" />
        <p className="text-muted">
          Finding free agents needs your league&apos;s rosters, which this app can&apos;t read (no authorized integration). Use the Injuries page and team pages&apos; &quot;Fantasy
          implications&quot; to spot who gains minutes, then add those players to your pool to compare. The draft extension in this repository reads your ESPN league
          inside your own browser session.
        </p>
      </Card>

      <Baseline cfg={cfg} />
    </div>
  );
}

function PoolRow({ p, cfg, report, z, zAvailable }: { p: FollowedPlayer; cfg: FantasyConfig; report: (id: string, d: RowData) => void; z: { total: number; byCat: Partial<Record<CategoryKey, number>> } | null; zAvailable: boolean }) {
  const { data, meta, isLoading, error } = usePlayer(p.id);
  useEffect(() => {
    if (data) report(p.id, { log: data.stats?.log ?? [], schedule: data.schedule, injury: data.injury, demo: meta.some((m) => m.mode === "demo") });
  }, [data, meta, p.id, report]);
  const remove = () =>
    updatePrefs((pr) => ({ fantasyPool: pr.fantasyPool.filter((x) => x.id !== p.id), followedPlayers: pr.followedPlayers.filter((x) => x.id !== p.id) }));
  const name = (
    <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-normal">
      <Link href={`/players/${p.id}`} className="inline-flex items-center gap-1.5 hover:underline">
        <TeamBadge id={data?.bio?.team?.id ?? p.teamId} /> {p.name}
      </Link>
    </th>
  );
  const rm = (
    <td className="px-2 text-right">
      <button onClick={remove} aria-label={`Remove ${p.name} from pool and watchlist`} className="text-faint hover:text-text">
        <Icon name="x" size={14} />
      </button>
    </td>
  );
  if (isLoading || error || !data)
    return (
      <tr className="border-t border-line">
        {name}
        <td colSpan={cfg.mode === "points" ? 9 : cfg.categories.length + 1} className="px-2 text-xs text-muted">
          {isLoading ? "Loading…" : "Stats unavailable"}
        </td>
        {rm}
      </tr>
    );
  if (cfg.mode === "categories")
    return (
      <tr className="border-t border-line">
        {name}
        {cfg.categories.map((c) => (
          <td key={c} className={cx("tabular px-2 text-right", z?.byCat[c] != null && (z.byCat[c]! > 0.5 ? "text-ok" : z.byCat[c]! < -0.5 ? "text-live" : ""))}>
            {z?.byCat[c] != null ? fmt(z.byCat[c]!) : "—"}
          </td>
        ))}
        <td className="tabular px-2 text-right font-semibold">{zAvailable && z ? fmt(z.total) : "—"}</td>
        {rm}
      </tr>
    );
  const out = !!data.injury && /^out/i.test(data.injury.status);
  const sched = gamesInNextDays(data.schedule, cfg.horizonDays);
  const o = outlook(data.stats?.log ?? [], cfg, sched?.count ?? null, out);
  return (
    <tr className="border-t border-line">
      {name}
      <td className={cx("whitespace-nowrap px-2 text-xs", out ? "font-semibold text-live" : data.injury ? "text-warn" : "text-faint")}>{data.injury?.status ?? "Active"}</td>
      <td className="tabular px-2 text-right">{o.season.gp}</td>
      <td className="tabular px-2 text-right">{o.season.gp ? fmt(o.season.fpg) : "—"}</td>
      <td className="tabular px-2 text-right">{o.recent.gp ? fmt(o.recent.fpg) : "—"}</td>
      <td className="tabular px-2 text-right">{o.last5.gp ? fmt(o.last5.fpg) : "—"}</td>
      <td className={cx("tabular px-2 text-right", o.signal === "hot" && "text-ok", o.signal === "cold" && "text-live")}>{o.season.gp ? `${o.trend >= 0 ? "+" : ""}${fmt(o.trend)}` : "—"}</td>
      <td className="tabular px-2 text-right">{o.season.gp ? `${o.minutesTrend >= 0 ? "+" : ""}${fmt(o.minutesTrend)}` : "—"}</td>
      <td className="tabular px-2 text-right">
        {sched ? sched.count : "—"}
        {sched && sched.backToBacks > 0 && <span className="ml-1 text-[10px] text-warn">B2B</span>}
      </td>
      <td className="tabular whitespace-nowrap px-2 text-right" title={o.projection?.assumptions}>
        {o.projection ? (
          <>
            {fmt(o.projection.total, 0)} <span className="text-[11px] text-faint">({fmt(o.projection.low, 0)}–{fmt(o.projection.high, 0)})</span>
          </>
        ) : (
          "—"
        )}
      </td>
      {rm}
    </tr>
  );
}

function Signals({ pool, rows, cfg }: { pool: FollowedPlayer[]; rows: Record<string, RowData>; cfg: FantasyConfig }) {
  const items = pool
    .map((p) => {
      const d = rows[p.id];
      if (!d) return null;
      const o = outlook(d.log, cfg, null, false);
      return { p, o, injured: !!d.injury };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.o.signal !== "insufficient");
  const buyLow = items.filter((x) => x.o.signal === "cold" && !x.injured);
  const sellHigh = items.filter((x) => x.o.signal === "hot");
  return (
    <Card className="p-4 text-sm">
      <SectionHeader title="Buy-low / sell-high (analysis)" />
      <p className="mb-2 text-xs text-muted">
        Based only on recent form vs season average for players in your pool. Recent slumps or hot streaks often regress toward the season average, but role changes
        can make them stick — check minutes and news first.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold">Buy-low candidates</h3>
          {buyLow.length ? (
            <ul className="space-y-1">
              {buyLow.map((x) => (
                <li key={x.p.id}>
                  <Link href={`/players/${x.p.id}`} className="underline">
                    {x.p.name}
                  </Link>{" "}
                  <span className="text-muted">
                    {fmt(x.o.recent.fpg)} recent vs {fmt(x.o.season.fpg)} season FP/G; minutes {x.o.minutesTrend >= 0 ? "+" : ""}
                    {fmt(x.o.minutesTrend)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">None in your pool right now.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1 font-semibold">Sell-high candidates</h3>
          {sellHigh.length ? (
            <ul className="space-y-1">
              {sellHigh.map((x) => (
                <li key={x.p.id}>
                  <Link href={`/players/${x.p.id}`} className="underline">
                    {x.p.name}
                  </Link>{" "}
                  <span className="text-muted">
                    {fmt(x.o.recent.fpg)} recent vs {fmt(x.o.season.fpg)} season FP/G; minutes {x.o.minutesTrend >= 0 ? "+" : ""}
                    {fmt(x.o.minutesTrend)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">None in your pool right now.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

type SheetRow = { fp?: number; gp?: number; mkt?: number; espnRank?: number; line?: string };

function Baseline({ cfg }: { cfg: FantasyConfig }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(25);
  const sheet = tierSheet as unknown as { source: string; season: string; players: Record<string, SheetRow> };
  const list = Object.entries(sheet.players)
    .filter((e): e is [string, Required<Pick<SheetRow, "fp" | "gp">> & SheetRow] => typeof e[1].fp === "number" && typeof e[1].gp === "number")
    .filter(([name]) => !q || name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b[1].fp - a[1].fp)
    .slice(0, n);
  return (
    <Card className="p-4">
      <SectionHeader title={`Last season baseline (${sheet.season})`} />
      <p className="mb-2 text-xs text-muted">
        From your bundled tier sheet: {sheet.source} FP/G uses the sheet&apos;s scoring
        {cfg.mode === "points" && JSON.stringify(cfg.weights) !== JSON.stringify(PRESETS[0].config.weights) ? " (not your current custom scoring)" : ""}. Actual
        2025-26 per-game stats — useful context early in a season, not a projection.
      </p>
      <div className="mb-2 flex gap-2">
        <label className="sr-only" htmlFor="bl-q">Filter baseline</label>
        <input id="bl-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" className="h-8 flex-1 rounded border border-line bg-surface-2 px-2 text-sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-faint">
            <tr>
              <th scope="col" className="px-2 py-1 text-left">#</th>
              <th scope="col" className="px-2 text-left">Player</th>
              <th scope="col" className="px-2 text-right">FP/G</th>
              <th scope="col" className="px-2 text-right">GP</th>
              <th scope="col" className="px-2 text-left">Line</th>
            </tr>
          </thead>
          <tbody>
            {list.map(([name, r], i) => (
              <tr key={name} className="border-t border-line">
                <td className="tabular px-2 py-1 text-faint">{i + 1}</td>
                <td className="px-2">{name}</td>
                <td className="tabular px-2 text-right">{r.fp.toFixed(1)}</td>
                <td className="tabular px-2 text-right">{r.gp}</td>
                <td className="px-2 text-xs text-muted">{r.line ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {n < Object.keys(sheet.players).length && !q && (
        <button onClick={() => setN((x) => x + 50)} className="mt-2 text-xs text-muted underline">
          Show more
        </button>
      )}
    </Card>
  );
}
