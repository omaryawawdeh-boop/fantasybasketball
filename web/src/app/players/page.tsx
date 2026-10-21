"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlayerIndex } from "@/client/data";
import { togglePlayer, usePrefs } from "@/client/state";
import { TEAMS } from "@/lib/teams";
import { fuzzyScore } from "@/lib/text";
import { Icon } from "@/components/icons";
import { cx, DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, SectionHeader, TeamBadge } from "@/components/ui";

export default function PlayersPage() {
  const { data, meta, error, isLoading, mutate } = usePlayerIndex();
  const prefs = usePrefs();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const list = useMemo(() => {
    const all = data?.players ?? [];
    const filtered = all.filter((p) => !team || p.teamId === team);
    if (!q.trim()) return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
    return filtered
      .map((p) => ({ p, s: fuzzyScore(q, p.name) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 100)
      .map((x) => x.p);
  }, [data, q, team]);

  return (
    <div>
      <SectionHeader as="h1" title="Players" right={<DataStatus meta={meta} />} />
      <DemoNotice meta={meta} />
      {prefs.followedPlayers.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Your watchlist</h2>
          <div className="flex flex-wrap gap-2">
            {prefs.followedPlayers.map((p) => (
              <Link key={p.id} href={`/players/${p.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-sm hover:bg-surface-2">
                <TeamBadge id={p.teamId} /> {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="pl-q">Search players</label>
        <input id="pl-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search current players (typos OK)…" className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm" />
        <label className="sr-only" htmlFor="pl-team">Team</label>
        <select id="pl-team" value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">All teams</option>
          {TEAMS.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <LoadingList rows={4} label="Loading players" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="players" />
      ) : list.length === 0 ? (
        <EmptyState title={data?.players.length ? "No players match" : "Player list unavailable"}>
          {data?.players.length ? "Check the spelling or clear the team filter." : "Rosters couldn't be loaded from the source."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map((p) => {
            const following = prefs.followedPlayers.some((x) => x.id === p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <Link href={`/players/${p.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <TeamBadge id={p.teamId} />
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-faint">{[p.position, p.jersey ? `#${p.jersey}` : null].filter(Boolean).join(" · ")}</span>
                  {p.injuryStatus && <span className="text-xs font-semibold text-warn">{p.injuryStatus}</span>}
                </Link>
                <button
                  onClick={() => togglePlayer({ id: p.id, name: p.name, teamId: p.teamId })}
                  aria-pressed={following}
                  aria-label={`${following ? "Unfollow" : "Follow"} ${p.name}`}
                  className={cx("rounded p-1.5", following ? "text-accent" : "text-faint hover:text-text")}
                >
                  <Icon name="star" size={16} fill={following ? "currentColor" : "none"} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-faint">Current rosters from ESPN (refreshed every few hours). Search finds current players; historical players are not indexed.</p>
    </div>
  );
}
