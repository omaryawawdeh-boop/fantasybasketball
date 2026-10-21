"use client";

import { useMemo, useState } from "react";
import { useScoreboard } from "@/client/data";
import { usePrefs } from "@/client/state";
import { TEAMS } from "@/lib/teams";
import type { GameState } from "@/lib/types";
import { GameCard } from "@/components/games/GameCard";
import { StandingsTables } from "@/components/games/Standings";
import { Icon } from "@/components/icons";
import { Chip, DataStatus, DemoNotice, EmptyState, ErrorState, SectionHeader, Skeleton, cx } from "@/components/ui";

function ymd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
/** Today's date on the NBA's calendar (US Eastern), as a local Date at midnight. */
function nbaToday(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p.replace(/-/g, "");
}
function fromYmd(s: string) {
  return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}

export default function GamesPage() {
  const [date, setDate] = useState(nbaToday);
  const [team, setTeam] = useState("");
  const [status, setStatus] = useState<"all" | GameState>("all");
  const prefs = usePrefs();
  const { data, meta, error, isLoading, mutate } = useScoreboard(date);
  const d = fromYmd(date);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 3 + i)), [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (n: number) => setDate(ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)));
  const games = (data?.games ?? []).filter((g) => (!team || g.home.id === team || g.away.id === team) && (status === "all" || g.state === status));
  const followed = games.filter((g) => prefs.followedTeams.includes(g.home.id) || prefs.followedTeams.includes(g.away.id));
  const rest = games.filter((g) => !followed.includes(g));

  return (
    <div>
      <SectionHeader as="h1" title="Games & scores" right={<DataStatus meta={meta} />} />
      <DemoNotice meta={meta} />
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => shift(-1)} aria-label="Previous day" className="rounded border border-line p-1.5 hover:bg-surface-2">
          <Icon name="chevronLeft" />
        </button>
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto" role="group" aria-label="Choose a day">
          {week.map((w) => {
            const k = ymd(w);
            const today = k === nbaToday();
            return (
              <button
                key={k}
                onClick={() => setDate(k)}
                aria-pressed={k === date}
                className={cx("min-w-14 flex-1 rounded-md border px-2 py-1 text-center text-xs", k === date ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}
              >
                <span className="block text-faint">{today ? "Today" : w.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="font-semibold">{w.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => shift(1)} aria-label="Next day" className="rounded border border-line p-1.5 hover:bg-surface-2">
          <Icon name="chevronRight" />
        </button>
        <label className="sr-only" htmlFor="g-date">
          Pick a date
        </label>
        <input
          id="g-date"
          type="date"
          value={`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`}
          onChange={(e) => e.target.value && setDate(e.target.value.replace(/-/g, ""))}
          className="hidden rounded border border-line bg-surface px-2 py-1 text-xs sm:block"
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="g-team">
          Team
        </label>
        <select id="g-team" value={team} onChange={(e) => setTeam(e.target.value)} className="rounded border border-line bg-surface px-2 py-1 text-xs">
          <option value="">All teams</option>
          {TEAMS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {(["all", "in", "pre", "post"] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : s === "in" ? "Live" : s === "pre" ? "Upcoming" : "Final"}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="the scoreboard" />
      ) : !data?.games ? (
        <EmptyState title="Scoreboard unavailable" icon="alert">
          The scores source couldn&apos;t be reached. No scores are shown rather than guessing.
        </EmptyState>
      ) : games.length === 0 ? (
        <EmptyState title={data.games.length ? "No games match these filters" : "No games on this date"} icon="calendar" />
      ) : (
        <>
          {followed.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-muted">Your teams</h2>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {followed.map((g) => (
                  <GameCard key={g.id} g={g} />
                ))}
              </div>
            </>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </div>
        </>
      )}
      <p className="mt-2 text-[11px] text-faint">Dates follow the NBA schedule (US Eastern); tip-off times are shown in your local time zone. Live scores refresh every 30 seconds while a game is in progress; the source itself may lag by a minute or more.</p>

      <div className="mt-8">
        <StandingsTables />
      </div>
    </div>
  );
}
