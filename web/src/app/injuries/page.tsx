"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useInjuries, useScoreboard } from "@/client/data";
import { useInjuryHistory, usePrefs } from "@/client/state";
import { TEAMS } from "@/lib/teams";
import { fuzzyScore } from "@/lib/text";
import { gameTime } from "@/components/games/GameCard";
import { injurySeverity } from "@/components/injuries/severity";
import { RelatedStories } from "@/components/feed/RelatedStories";
import { absTime, Chip, cx, DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, SectionHeader, TeamBadge, TimeAgo } from "@/components/ui";

export default function InjuriesPage() {
  const { data, meta, error, isLoading, mutate } = useInjuries();
  const sb = useScoreboard();
  const prefs = usePrefs();
  const history = useInjuryHistory();
  const [team, setTeam] = useState("");
  const [sev, setSev] = useState<"all" | "out" | "gtd">("all");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");

  const today = new Map<string, { label: string; gameId: string }>();
  for (const g of sb.data?.games ?? []) {
    const label = g.state === "pre" ? `Today ${gameTime(g)}` : g.state === "in" ? "Playing now" : "Played today";
    today.set(g.home.id, { label, gameId: g.id });
    today.set(g.away.id, { label, gameId: g.id });
  }

  const followedP = new Set([...prefs.followedPlayers, ...prefs.fantasyPool].map((p) => p.id));
  const rows = useMemo(() => {
    return (data?.injuries ?? [])
      .filter((e) => !team || e.teamId === team)
      .filter((e) => sev === "all" || (sev === "out" ? injurySeverity(e.status) >= 3 : injurySeverity(e.status) === 2))
      .filter((e) => !mine || (e.playerId && followedP.has(e.playerId)) || prefs.followedTeams.includes(e.teamId))
      .filter((e) => !q.trim() || fuzzyScore(q, `${e.playerName} ${e.teamAbbr}`) > 0)
      .sort((a, b) => Number(today.has(b.teamId)) - Number(today.has(a.teamId)) || injurySeverity(b.status) - injurySeverity(a.status) || Date.parse(b.reportedAt ?? "") - Date.parse(a.reportedAt ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, team, sev, mine, q, sb.data, prefs.followedTeams]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader as="h1" title="Injuries & lineups" right={<DataStatus meta={meta} />} />
        <DemoNotice meta={meta} />
        <p className="-mt-1 mb-4 text-sm text-muted">
          Availability from ESPN&apos;s injury feed, which compiles team and league reports. It is <strong>not</strong> the league&apos;s official injury report, so
          entries are labeled &quot;Reported&quot;. Status changes are recorded by this browser while the app is open.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="inj-q">Search</label>
          <input id="inj-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Player or team…" className="h-8 rounded-md border border-line bg-surface px-2 text-sm" />
          <label className="sr-only" htmlFor="inj-team">Team</label>
          <select id="inj-team" value={team} onChange={(e) => setTeam(e.target.value)} className="h-8 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All teams</option>
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Chip active={sev === "all"} onClick={() => setSev("all")}>All statuses</Chip>
          <Chip active={sev === "out"} onClick={() => setSev("out")}>Out / doubtful</Chip>
          <Chip active={sev === "gtd"} onClick={() => setSev("gtd")}>Questionable</Chip>
          <Chip active={mine} onClick={() => setMine((v) => !v)}>Watchlist & fantasy pool</Chip>
        </div>
        {isLoading ? (
          <LoadingList rows={4} label="Loading injuries" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => mutate()} what="injuries" />
        ) : !data?.injuries ? (
          <EmptyState title="Injury source unavailable" icon="alert">No injury statuses are shown rather than guessing.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="No injuries match these filters" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">Injury list</caption>
              <thead className="text-[11px] uppercase text-faint">
                <tr>
                  {["Player", "Status", "Previous", "Injury", "Updated", "Next game"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-1.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const key = e.playerId ?? `${e.teamId}:${e.playerName}`;
                  const h = history[key] ?? [];
                  const prev = h.length > 1 ? h[h.length - 2].status : null;
                  const g = today.get(e.teamId);
                  const fav = e.playerId && followedP.has(e.playerId);
                  return (
                    <tr key={key} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <TeamBadge id={e.teamId} />
                          {e.playerId ? <Link href={`/players/${e.playerId}`} className="font-medium hover:underline">{e.playerName}</Link> : <span className="font-medium">{e.playerName}</span>}
                          {fav && <span className="text-[10px] text-accent">watchlist</span>}
                        </span>
                        {e.detail && <span className="mt-0.5 block max-w-md text-xs text-muted">{e.detail}</span>}
                      </td>
                      <td className={cx("whitespace-nowrap px-3 py-2 font-semibold", injurySeverity(e.status) >= 3 ? "text-live" : injurySeverity(e.status) === 2 ? "text-warn" : "text-muted")}>
                        {e.status}
                        <span className="block text-[10px] font-normal text-faint">Reported</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{prev ?? "—"}</td>
                      <td className="px-3 py-2 text-muted">
                        {e.injury ?? "—"}
                        {e.returnDate && <span className="block text-[11px] text-faint">Est. return {e.returnDate} (source estimate)</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted" title={absTime(e.reportedAt)}>
                        <TimeAgo iso={e.reportedAt} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {g ? <Link href={`/games/${g.gameId}`} className="underline">{g.label}</Link> : <Link href={`/teams/${e.teamId}`} className="text-muted underline">Schedule</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section>
        <SectionHeader title="Today's lineups" />
        <p className="mb-2 text-sm text-muted">
          Starters are confirmed only when the box score marks them after tip-off. Before that, game pages show who started each team&apos;s previous game, labeled as such — not a prediction.
        </p>
        {sb.data?.games?.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sb.data.games.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}`} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-faint">
                  <span className="flex items-center gap-2">
                    <TeamBadge id={g.away.id} /> @ <TeamBadge id={g.home.id} />
                  </span>
                  <span className={cx("text-xs", g.state === "pre" ? "text-muted" : "text-ok")}>{g.state === "pre" ? `Not confirmed · ${gameTime(g)}` : "Starters confirmed"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No games today.</p>
        )}
      </section>

      <section>
        <SectionHeader title="Injury & lineup news" />
        <RelatedStories types={["injury", "lineup"]} limit={8} empty="No recent injury or lineup stories." />
      </section>
    </div>
  );
}
