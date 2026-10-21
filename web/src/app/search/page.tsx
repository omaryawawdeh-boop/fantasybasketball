"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Game, InjuryEntry, RosterPlayer, StoryCluster, TeamInfo } from "@/lib/types";
import { useApi } from "@/client/api";
import { updatePrefs, usePrefs } from "@/client/state";
import { StoryCard } from "@/components/feed/StoryCard";
import { GameCard } from "@/components/games/GameCard";
import { Icon } from "@/components/icons";
import { DemoNotice, EmptyState, ErrorState, LoadingList, SectionHeader, TeamBadge, TimeAgo } from "@/components/ui";

interface SearchResult {
  query: string;
  chips: { key: string; label: string }[];
  compare: string[] | null;
  players: RosterPlayer[];
  teams: TeamInfo[];
  games: Game[];
  stories: StoryCluster[];
  injuries: InjuryEntry[];
  sources: { id: string; name: string; category: string }[];
}

const EXAMPLES = [
  "Knicks injuries last 3 days",
  "biggest Celtics stories this week",
  "credible trade reports",
  "highlights today",
  "compare Jalen Brunson and Tyrese Maxey",
];

export default function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";
  const ignore = params.get("ignore") ?? "";
  const prefs = usePrefs();
  const url = q ? `/api/search?q=${encodeURIComponent(q)}${ignore ? `&ignore=${encodeURIComponent(ignore)}` : ""}` : null;
  const { data, meta, error, isLoading, mutate } = useApi<SearchResult>(url);
  const go = (next: string, nextIgnore = "") => router.push(`/search?q=${encodeURIComponent(next)}${nextIgnore ? `&ignore=${encodeURIComponent(nextIgnore)}` : ""}`);
  const savedAlready = prefs.savedSearches.includes(q);
  const total = data ? data.players.length + data.teams.length + data.games.length + data.stories.length + data.injuries.length + data.sources.length : 0;

  return (
    <div className="space-y-5">
      <SectionHeader as="h1" title="Search" />
      <SearchForm key={q} initial={q} onSearch={(v) => go(v)} />

      {!q ? (
        <div className="text-sm text-muted">
          <p>Search players, teams, games, stories, reporters and sources. Plain-language filters work too:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <button onClick={() => go(e)} className="rounded-full border border-line px-3 py-1 hover:bg-surface-2">
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : isLoading ? (
        <LoadingList rows={3} label="Searching" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="search results" />
      ) : data ? (
        <>
          <DemoNotice meta={meta} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {data.chips.length > 0 && <span className="text-muted">Interpreted as:</span>}
            {data.chips.map((c) => (
              <button
                key={c.key}
                onClick={() => go(q, [...ignore.split(",").filter(Boolean), c.key].join(","))}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs hover:bg-surface-3"
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label} <Icon name="x" size={12} />
              </button>
            ))}
            {ignore && (
              <button onClick={() => go(q)} className="text-xs text-muted underline">
                Restore filters
              </button>
            )}
            <button
              onClick={() => updatePrefs((p) => ({ savedSearches: savedAlready ? p.savedSearches.filter((s) => s !== q) : [...p.savedSearches, q] }))}
              aria-pressed={savedAlready}
              className="ml-auto inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs hover:bg-surface-2"
            >
              <Icon name="bookmark" size={12} fill={savedAlready ? "currentColor" : "none"} /> {savedAlready ? "Saved search" : "Save search"}
            </button>
          </div>

          {data.compare && (
            <Link href={`/stats?players=${data.compare.join(",")}`} className="flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
              <Icon name="compare" /> Open the comparison for these players
            </Link>
          )}

          {total === 0 && !data.compare ? (
            <EmptyState title={`No results for “${data.query}”`} icon="search">
              Check spelling, remove a filter above, or try fewer words. Search covers current players, teams, games from the past and next three days, and stories in the
              current feed window.
            </EmptyState>
          ) : (
            <div className="space-y-6">
              {data.players.length > 0 && (
                <section>
                  <SectionHeader title="Players" />
                  <ul className="flex flex-wrap gap-2">
                    {data.players.map((p) => (
                      <li key={p.id}>
                        <Link href={`/players/${p.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2">
                          <TeamBadge id={p.teamId} /> {p.name} <span className="text-xs text-faint">{p.position}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.teams.length > 0 && (
                <section>
                  <SectionHeader title="Teams" />
                  <ul className="flex flex-wrap gap-2">
                    {data.teams.map((t) => (
                      <li key={t.id}>
                        <Link href={`/teams/${t.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2">
                          <TeamBadge id={t.id} /> {t.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.injuries.length > 0 && (
                <section>
                  <SectionHeader title="Injury list" />
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
                    {data.injuries.map((e) => (
                      <li key={`${e.teamId}${e.playerName}`} className="flex justify-between px-3 py-2">
                        <span className="flex items-center gap-2">
                          <TeamBadge id={e.teamId} /> {e.playerId ? <Link className="hover:underline" href={`/players/${e.playerId}`}>{e.playerName}</Link> : e.playerName}
                        </span>
                        <span className="text-xs">
                          <strong>{e.status}</strong> · <TimeAgo iso={e.reportedAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.games.length > 0 && (
                <section>
                  <SectionHeader title="Games" />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {data.games.map((g) => (
                      <GameCard key={g.id} g={g} />
                    ))}
                  </div>
                </section>
              )}
              {data.stories.length > 0 && (
                <section>
                  <SectionHeader title={`Stories (${data.stories.length})`} />
                  <div className="space-y-3">
                    {data.stories.map((c) => (
                      <StoryCard key={c.id} cluster={c} />
                    ))}
                  </div>
                </section>
              )}
              {data.sources.length > 0 && (
                <section>
                  <SectionHeader title="Sources" />
                  <ul className="text-sm">
                    {data.sources.map((s) => (
                      <li key={s.id}>
                        {s.name} <span className="text-xs text-faint">({s.category})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

/** Keyed by the current query so the box resets when the URL changes (Back/Forward). */
function SearchForm({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [input, setInput] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) onSearch(input.trim());
      }}
      className="flex gap-2"
    >
      <label htmlFor="sq" className="sr-only">
        Search
      </label>
      <input
        id="sq"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Try: Knicks injuries last 3 days"
        className="h-10 flex-1 rounded-md border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
      />
      <button type="submit" className="rounded-md bg-accent px-4 text-sm font-medium text-black">
        Search
      </button>
    </form>
  );
}
