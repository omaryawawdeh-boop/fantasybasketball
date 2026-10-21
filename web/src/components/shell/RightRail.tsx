"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFeed, useInjuries, useScoreboard } from "@/client/data";
import { usePrefs } from "@/client/state";
import { DataStatus, EmptyState, Skeleton, TeamBadge, TimeAgo, useNow } from "../ui";
import { GameCard } from "../games/GameCard";
import { injurySeverity } from "../injuries/severity";
import { StoryLink } from "../feed/StoryLink";

export function RightRail() {
  return (
    <div className="space-y-6">
      <TodayGames />
      <KeyInjuries />
      <Trending />
    </div>
  );
}

function RailHeader({ title, href, meta }: { title: string; href: string; meta?: Parameters<typeof DataStatus>[0]["meta"] }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold">
        <Link href={href} className="hover:underline">
          {title}
        </Link>
      </h2>
      {meta && <DataStatus meta={meta} />}
    </div>
  );
}

function TodayGames() {
  const { data, meta, error, isLoading } = useScoreboard();
  return (
    <section aria-label="Today's games">
      <RailHeader title="Today's games" href="/games" meta={meta} />
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : error ? (
        <p className="text-xs text-muted">Scores unavailable: {error.message}</p>
      ) : !data?.games ? (
        <p className="text-xs text-muted">Scoreboard source unavailable right now.</p>
      ) : data.games.length === 0 ? (
        <p className="text-xs text-muted">No games today.</p>
      ) : (
        <div className="space-y-2">
          {data.games.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </section>
  );
}

function KeyInjuries() {
  const { data, meta, isLoading } = useInjuries();
  const prefs = usePrefs();
  const list = useMemo(() => {
    const all = data?.injuries ?? [];
    const followedP = new Set(prefs.followedPlayers.map((p) => p.id));
    const followedT = new Set(prefs.followedTeams);
    return [...all]
      .map((e) => ({ e, mine: (e.playerId && followedP.has(e.playerId)) || followedT.has(e.teamId) }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || injurySeverity(b.e.status) - injurySeverity(a.e.status) || Date.parse(b.e.reportedAt ?? "") - Date.parse(a.e.reportedAt ?? ""))
      .slice(0, 6);
  }, [data, prefs.followedPlayers, prefs.followedTeams]);
  return (
    <section aria-label="Injury updates">
      <RailHeader title="Injury updates" href="/injuries" meta={meta} />
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <p className="text-xs text-muted">{data?.injuries ? "No injuries listed." : "Injury source unavailable right now."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map(({ e, mine }) => (
            <li key={`${e.teamId}-${e.playerName}`} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamBadge id={e.teamId} />
                  {e.playerId ? (
                    <Link className="truncate hover:underline" href={`/players/${e.playerId}`}>
                      {e.playerName}
                    </Link>
                  ) : (
                    <span className="truncate">{e.playerName}</span>
                  )}
                  {mine && <span className="text-[10px] text-accent">following</span>}
                </span>
                <span className={injurySeverity(e.status) >= 3 ? "text-xs font-semibold text-live" : "text-xs font-semibold text-warn"}>{e.status}</span>
              </div>
              <div className="text-[11px] text-faint">
                {e.injury ?? "Injury not specified"} · <TimeAgo iso={e.reportedAt} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Trending() {
  const { data, isLoading } = useFeed();
  const now = useNow();
  const top = useMemo(
    () =>
      (data?.clusters ?? [])
        .filter((c) => now - Date.parse(c.lastUpdatedAt) < 36 * 3600_000)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5),
    [data, now],
  );
  return (
    <section aria-label="Top stories">
      <RailHeader title="Top stories" href="/news" />
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : top.length === 0 ? (
        <EmptyState title="No recent stories" />
      ) : (
        <ol className="space-y-2">
          {top.map((c, i) => (
            <li key={c.id} className="flex gap-2 text-sm">
              <span className="tabular w-4 shrink-0 text-faint">{i + 1}</span>
              <StoryLink id={c.id} className="hover:underline">
                {c.lead.title}
                <span className="block text-[11px] text-faint">
                  {c.independentSources.length > 1 ? `${c.independentSources.length} outlets` : c.lead.sourceName} · <TimeAgo iso={c.lastUpdatedAt} />
                </span>
              </StoryLink>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
