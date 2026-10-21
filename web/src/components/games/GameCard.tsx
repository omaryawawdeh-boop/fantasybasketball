"use client";

import Link from "next/link";
import type { Game, GameTeam } from "@/lib/types";
import { cx, TeamBadge } from "../ui";

export function gameTime(g: Game): string {
  return new Date(g.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function StatusLabel({ g }: { g: Game }) {
  if (g.state === "in")
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-live">
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
        <span className="sr-only">Live:</span>
        {g.statusText || "Live"}
      </span>
    );
  if (g.state === "post") return <span className="font-medium text-muted">{g.statusText || "Final"}</span>;
  if (g.state === "postponed") return <span className="font-medium text-warn">{g.statusText || "Postponed"}</span>;
  if (g.state === "pre") return <span className="text-muted">{gameTime(g)}</span>;
  return <span className="text-faint">{g.statusText || "Status unknown"}</span>;
}

function Row({ t, g }: { t: GameTeam; g: Game }) {
  const showScore = g.state === "in" || g.state === "post";
  const lost = g.state === "post" && t.winner === false;
  return (
    <div className={cx("flex items-center justify-between gap-2", lost && "text-muted")}>
      <span className="flex min-w-0 items-center gap-2">
        <TeamBadge id={t.id} abbr={t.abbr} />
        <span className="truncate text-sm font-medium">{t.abbr}</span>
        {t.record && <span className="text-[11px] text-faint">{t.record}</span>}
      </span>
      {showScore && <span className="tabular text-sm font-semibold">{t.score ?? "–"}</span>}
    </div>
  );
}

/** Compact card used in the score strip and the right rail. */
export function GameCard({ g, className }: { g: Game; className?: string }) {
  const label = `${g.away.name} at ${g.home.name}, ${g.state === "pre" ? `starts ${gameTime(g)}` : g.state === "in" ? `live, ${g.away.score} to ${g.home.score}` : g.state === "post" ? `final, ${g.away.score} to ${g.home.score}` : g.statusText}`;
  return (
    <Link
      href={`/games/${g.id}`}
      aria-label={label}
      className={cx("block rounded-lg border border-line bg-surface px-3 py-2 hover:border-faint", g.state === "in" && "border-live/40", className)}
    >
      <div className="mb-1 text-[11px]">
        <StatusLabel g={g} />
      </div>
      <div className="space-y-1">
        <Row t={g.away} g={g} />
        <Row t={g.home} g={g} />
      </div>
    </Link>
  );
}
