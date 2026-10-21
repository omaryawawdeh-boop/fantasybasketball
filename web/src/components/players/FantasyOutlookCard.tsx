"use client";

import Link from "next/link";
import type { GameLogEntry, ScheduleGame } from "@/lib/types";
import { outlook } from "@/lib/fantasy";
import { fmt } from "@/lib/stats";
import { usePrefs } from "@/client/state";
import { cx } from "../ui";

export function gamesInNextDays(schedule: ScheduleGame[] | null, days: number, now = Date.now()): { count: number; backToBacks: number; games: ScheduleGame[] } | null {
  if (!schedule) return null;
  const games = schedule.filter((g) => g.state === "pre" && Date.parse(g.date) >= now - 3 * 3600_000 && Date.parse(g.date) <= now + days * 86_400_000);
  let b2b = 0;
  for (let i = 1; i < games.length; i++) {
    const dayGap = Math.round((Date.parse(games[i].date) - Date.parse(games[i - 1].date)) / 86_400_000);
    if (dayGap <= 1) b2b++;
  }
  return { count: games.length, backToBacks: b2b, games };
}

export function FantasyOutlookCard({ log, schedule, statusOut }: { log: GameLogEntry[]; schedule: ScheduleGame[] | null; statusOut: boolean }) {
  const prefs = usePrefs();
  const cfg = prefs.fantasy;
  const sched = gamesInNextDays(schedule, cfg.horizonDays);
  const o = outlook(log, cfg, sched?.count ?? null, statusOut);
  if (cfg.mode === "categories")
    return (
      <p className="text-sm text-muted">
        Your scoring is set to categories. Category value is relative to other players — compare players in the{" "}
        <Link href="/fantasy" className="underline">
          Fantasy center
        </Link>
        .
      </p>
    );
  if (o.season.gp === 0) return <p className="text-sm text-muted">No games played this season yet, so there&apos;s nothing to base an outlook on.</p>;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Season FP/G", o.season.fpg, `${o.season.gp} gp`],
          [`Last ${cfg.recentGames} FP/G`, o.recent.fpg, `${o.recent.gp} gp`],
          ["Last 5 FP/G", o.last5.fpg, `${o.last5.gp} gp`],
        ].map(([k, v, n]) => (
          <div key={k as string} className="rounded-md bg-surface-2 px-2 py-1.5">
            <p className="text-[11px] text-faint">{k}</p>
            <p className="tabular text-lg font-semibold">{fmt(v as number)}</p>
            <p className="text-[11px] text-faint">{n}</p>
          </div>
        ))}
      </div>
      <p>
        Form:{" "}
        <strong className={cx(o.signal === "hot" && "text-ok", o.signal === "cold" && "text-live")}>
          {o.signal === "insufficient" ? "not enough games (need 6+)" : o.signal}
        </strong>{" "}
        ({o.trend >= 0 ? "+" : ""}
        {fmt(o.trend)} FP/G vs season; minutes {o.minutesTrend >= 0 ? "+" : ""}
        {fmt(o.minutesTrend)})
      </p>
      {sched && (
        <p>
          Next {cfg.horizonDays} days: <strong>{sched.count}</strong> game{sched.count === 1 ? "" : "s"}
          {sched.backToBacks > 0 && <span className="text-warn"> · {sched.backToBacks} back-to-back</span>}
        </p>
      )}
      {o.projection ? (
        <div className="rounded-md border border-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Projection (estimate, not a fact)</p>
          <p className="tabular text-lg font-semibold">
            {fmt(o.projection.total, 0)} FP <span className="text-sm font-normal text-muted">(range {fmt(o.projection.low, 0)}–{fmt(o.projection.high, 0)})</span>
          </p>
          <p className="text-xs text-muted">{o.projection.assumptions}</p>
        </div>
      ) : (
        <p className="text-xs text-muted">No projection: needs at least 3 games played and a schedule from the source.</p>
      )}
      <p className="text-[11px] text-faint">
        Scoring: {cfg.mode === "points" ? "points league (edit in Fantasy → Scoring)" : "categories"}. Actual stats are from the game log; projections are simple
        estimates.
      </p>
    </div>
  );
}
