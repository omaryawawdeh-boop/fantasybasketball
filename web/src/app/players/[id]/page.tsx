"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { ContentType } from "@/lib/types";
import { selectGames, summarize, seasonLabelFromEspnYear } from "@/lib/stats";
import { usePlayer } from "@/client/data";
import { togglePlayer, updatePrefs, useInjuryHistory, usePrefs } from "@/client/state";
import { AveragesGrid, CareerTable, GameLogTable } from "@/components/players/StatTables";
import { FantasyOutlookCard, gamesInNextDays } from "@/components/players/FantasyOutlookCard";
import { LineChart, SERIES_COLORS } from "@/components/charts/LineChart";
import { RelatedStories } from "@/components/feed/RelatedStories";
import { Icon } from "@/components/icons";
import { injurySeverity } from "@/components/injuries/severity";
import { absTime, Card, Chip, cx, DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, SafeImg, SectionHeader, TeamBadge, TimeAgo } from "@/components/ui";

const TABS = ["Overview", "Game log", "Career", "News", "Availability", "Fantasy"] as const;
type Tab = (typeof TABS)[number];

const NEWS_FILTERS: { label: string; types?: ContentType[] }[] = [
  { label: "All" },
  { label: "Injuries", types: ["injury"] },
  { label: "Highlights", types: ["highlight", "interview"] },
  { label: "Transactions & rumors", types: ["transaction", "rumor"] },
  { label: "Games & stats", types: ["result", "lineup"] },
  { label: "Analysis & fantasy", types: ["analysis", "fantasy"] },
];

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("Overview");
  const [newsFilter, setNewsFilter] = useState(0);
  const { data, meta, error, isLoading, mutate } = usePlayer(id, season);
  const prefs = usePrefs();
  const history = useInjuryHistory();

  const log = useMemo(() => data?.stats?.log ?? [], [data]);
  const seasonSum = useMemo(() => summarize(selectGames(log, { kind: "all" })), [log]);
  const last10 = useMemo(() => summarize(selectGames(log, { kind: "lastN", n: 10 })), [log]);
  const recent = useMemo(() => selectGames(log, { kind: "lastN", n: 20 }).reverse(), [log]);

  if (isLoading) return <LoadingList rows={4} label="Loading player" />;
  if (error) return <ErrorState error={error} onRetry={() => mutate()} what="this player" />;
  if (!data?.bio) return <EmptyState title="Player not found or source unavailable" icon="alert">The player source couldn&apos;t be reached or doesn&apos;t know this id.</EmptyState>;

  const { bio, injury } = data;
  const following = prefs.followedPlayers.some((p) => p.id === bio.id);
  const inPool = prefs.fantasyPool.some((p) => p.id === bio.id);
  const seasonLabel = seasonLabelFromEspnYear(data.season);
  const isCurrent = data.season === data.currentSeason;
  const upcoming = gamesInNextDays(data.schedule, 10);
  const hist = history[bio.id] ?? [];

  return (
    <div className="space-y-5">
      <DemoNotice meta={meta} />
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-4">
          {prefs.publisherImages && <SafeImg src={bio.headshot} alt={`${bio.name} headshot`} className="h-20 w-20 rounded-full bg-surface-2 object-cover" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{bio.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {bio.team ? (
                <Link href={`/teams/${bio.team.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <TeamBadge id={bio.team.id} /> {bio.team.name}
                </Link>
              ) : (
                <span>No current team listed</span>
              )}
              {bio.position && <span>· {bio.position}</span>}
              {bio.jersey && <span>· #{bio.jersey}</span>}
            </p>
            <p className="mt-1 text-xs text-faint">
              {[bio.height, bio.weight, bio.age != null ? `Age ${bio.age}` : null, bio.experience != null ? `${bio.experience} yr exp` : null, bio.college].filter(Boolean).join(" · ")}
            </p>
            {injury && (
              <p className={cx("mt-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold", injurySeverity(injury.status) >= 3 ? "bg-live/15 text-live" : "bg-warn/15 text-warn")}>
                <Icon name="medical" size={12} /> {injury.status}
                {injury.injury ? ` — ${injury.injury}` : ""} <span className="font-normal text-muted">(ESPN, <TimeAgo iso={injury.reportedAt} />)</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => togglePlayer({ id: bio.id, name: bio.name, teamId: bio.team?.id ?? null })}
              aria-pressed={following}
              className={cx("inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm", following ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}
            >
              <Icon name="star" size={14} fill={following ? "currentColor" : "none"} /> {following ? "Following" : "Follow"}
            </button>
            <Link href={`/stats?players=${bio.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
              <Icon name="compare" size={14} /> Compare
            </Link>
            <button
              onClick={() =>
                updatePrefs((p) => ({
                  fantasyPool: inPool ? p.fantasyPool.filter((x) => x.id !== bio.id) : [...p.fantasyPool, { id: bio.id, name: bio.name, teamId: bio.team?.id ?? null }],
                }))
              }
              aria-pressed={inPool}
              className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Icon name="trophy" size={14} /> {inPool ? "In fantasy pool" : "Add to fantasy pool"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 text-muted">
            Season
            <select value={data.season} onChange={(e) => setSeason(Number(e.target.value))} className="rounded border border-line bg-surface-2 px-2 py-1 text-text">
              {Array.from({ length: 6 }, (_, i) => data.currentSeason - i).map((y) => (
                <option key={y} value={y}>
                  {seasonLabelFromEspnYear(y)}
                  {y === data.currentSeason ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <DataStatus meta={meta} />
        </div>
      </Card>

      <div role="tablist" aria-label="Player sections" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              const i = TABS.indexOf(t);
              if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length]);
              if (e.key === "ArrowLeft") setTab(TABS[(i - 1 + TABS.length) % TABS.length]);
            }}
            tabIndex={tab === t ? 0 : -1}
            className={cx("shrink-0 border-b-2 px-3 py-2 text-sm", tab === t ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text")}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-5">
        {tab === "Overview" && (
          <>
            <Card className="p-4">
              <SectionHeader title={`${seasonLabel} regular season`} />
              {seasonSum.gp === 0 ? <p className="text-sm text-muted">No regular-season games played{isCurrent ? " yet this season" : ""}.</p> : <AveragesGrid s={seasonSum} label={`${seasonLabel} regular season`} />}
              {last10.gp > 0 && last10.gp < seasonSum.gp && (
                <div className="mt-4">
                  <AveragesGrid s={last10} label={`Last ${last10.gp} games`} />
                </div>
              )}
            </Card>
            {recent.length >= 2 && (
              <Card className="p-4">
                <SectionHeader title={`Trend — last ${recent.length} games`} />
                <LineChart
                  title={`${bio.name} points, rebounds and minutes by game`}
                  labels={recent.map((g) => new Date(g.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }))}
                  series={[
                    { name: "Points", color: SERIES_COLORS[0], values: recent.map((g) => g.pts) },
                    { name: "Rebounds", color: SERIES_COLORS[1], values: recent.map((g) => g.reb) },
                    { name: "Minutes", color: SERIES_COLORS[2], values: recent.map((g) => g.min) },
                  ]}
                />
              </Card>
            )}
            {isCurrent && (
              <Card className="p-4">
                <SectionHeader title="Upcoming games" />
                {!upcoming ? (
                  <p className="text-sm text-muted">Schedule unavailable.</p>
                ) : upcoming.games.length === 0 ? (
                  <p className="text-sm text-muted">No games in the next 10 days.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {upcoming.games.map((g, i) => {
                      const b2b = i > 0 && Math.round((Date.parse(g.date) - Date.parse(upcoming.games[i - 1].date)) / 86_400_000) <= 1;
                      return (
                        <li key={g.id} className="flex items-center justify-between py-1.5">
                          <Link href={`/games/${g.id}`} className="flex items-center gap-2 hover:underline">
                            {g.homeAway === "away" ? "@" : "vs"} <TeamBadge id={g.opponent.id} /> {g.opponent.name}
                          </Link>
                          <span className="text-xs text-muted">
                            {absTime(g.date)} {b2b && <span className="ml-1 text-warn">back-to-back</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
            <section>
              <SectionHeader title="Latest news" />
              <RelatedStories playerIds={[bio.id]} limit={3} empty="No recent stories mention this player." />
            </section>
          </>
        )}

        {tab === "Game log" && (
          <>
            <p className="text-xs text-muted">
              {seasonLabel} · regular season and playoffs as labeled by the source · most recent first · source: ESPN
            </p>
            <GameLogTable games={[...log].filter((g) => g.seasonType !== "preseason")} />
          </>
        )}

        {tab === "Career" && <CareerTable rows={data.stats?.careerAverages ?? []} />}

        {tab === "News" && (
          <>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="News category">
              {NEWS_FILTERS.map((f, i) => (
                <Chip key={f.label} active={newsFilter === i} onClick={() => setNewsFilter(i)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <RelatedStories playerIds={[bio.id]} types={NEWS_FILTERS[newsFilter].types} limit={20} empty="No stories in this category mention this player." />
          </>
        )}

        {tab === "Availability" && (
          <Card className="p-4 text-sm">
            <SectionHeader title="Availability" />
            {injury ? (
              <div>
                <p>
                  <strong>{injury.status}</strong>
                  {injury.injury && ` — ${injury.injury}`}
                </p>
                {injury.detail && <p className="mt-1 text-muted">{injury.detail}</p>}
                <p className="mt-1 text-xs text-faint">
                  {injury.sourceName} (compiled report, not the league&apos;s official injury report) · updated {absTime(injury.reportedAt)}
                  {injury.returnDate && ` · estimated return ${injury.returnDate}`}
                </p>
              </div>
            ) : (
              <p className="text-muted">Not on the current injury list from the source.</p>
            )}
            <h3 className="mt-4 font-semibold">Status changes seen by this browser</h3>
            {hist.length === 0 ? (
              <p className="text-muted">None recorded yet. History is built from what this app has seen while open; it starts empty.</p>
            ) : (
              <ol className="mt-1 space-y-1">
                {hist.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-40 shrink-0 text-xs text-faint">{absTime(h.firstSeen)}</span>
                    <span>
                      {i > 0 && <span className="text-muted">{hist[i - 1].status} → </span>}
                      <strong>{h.status}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}

        {tab === "Fantasy" && (
          <Card className="p-4">
            <SectionHeader title="Fantasy outlook" right={<Link href="/fantasy" className="text-xs underline text-muted">Scoring settings</Link>} />
            <FantasyOutlookCard log={log} schedule={isCurrent ? data.schedule : null} statusOut={!!injury && /^out/i.test(injury.status)} />
          </Card>
        )}
      </div>
    </div>
  );
}
