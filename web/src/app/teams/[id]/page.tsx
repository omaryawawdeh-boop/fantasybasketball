"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { ContentType } from "@/lib/types";
import { teamById } from "@/lib/teams";
import { useTeam } from "@/client/data";
import { toggleTeam, usePrefs } from "@/client/state";
import { RelatedStories } from "@/components/feed/RelatedStories";
import { LastStarters } from "@/components/games/LastStarters";
import { StandingsTables } from "@/components/games/Standings";
import { injurySeverity } from "@/components/injuries/severity";
import { Icon } from "@/components/icons";
import { absTime, Card, Chip, cx, DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, SectionHeader, TeamBadge, TimeAgo } from "@/components/ui";

const NEWS_TABS: { label: string; types?: ContentType[] }[] = [
  { label: "All news" },
  { label: "Injuries", types: ["injury", "lineup"] },
  { label: "Transactions", types: ["transaction", "rumor"] },
  { label: "Highlights", types: ["highlight", "interview"] },
  { label: "Analysis", types: ["analysis", "fantasy"] },
  { label: "History", types: ["history"] },
];

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const team = teamById(id);
  const { data, meta, error, isLoading, mutate } = useTeam(id);
  const prefs = usePrefs();
  const [newsTab, setNewsTab] = useState(0);
  if (!team) return <EmptyState title="Unknown team" />;
  const following = prefs.followedTeams.includes(team.id);
  const sched = data?.schedule ?? [];
  const recent = sched.filter((g) => g.state === "post").slice(-5).reverse();
  const upcoming = sched.filter((g) => g.state === "pre" || g.state === "in").slice(0, 5);
  const injuries = data?.injuries ?? [];
  const out = injuries.filter((e) => injurySeverity(e.status) >= 3);

  return (
    <div className="space-y-6">
      <DemoNotice meta={meta} />
      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${team.color} 0 70%, ${team.altColor} 70%)` }} aria-hidden />
        <div className="flex flex-wrap items-center gap-4 p-4">
          <TeamBadge id={team.id} size="lg" />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
            <p className="text-sm text-muted">
              {data?.standing
                ? `${data.standing.wins}-${data.standing.losses} · ${team.conference} #${data.standing.seed ?? "?"} · streak ${data.standing.streak ?? "—"}`
                : `${team.conference}ern Conference`}
            </p>
          </div>
          <button
            onClick={() => toggleTeam(team.id)}
            aria-pressed={following}
            className={cx("inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm", following ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}
          >
            <Icon name="star" size={14} fill={following ? "currentColor" : "none"} /> {following ? "Following" : "Follow"}
          </button>
        </div>
        <div className="px-4 pb-3 text-right">
          <DataStatus meta={meta} />
        </div>
      </Card>

      {isLoading ? (
        <LoadingList rows={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} what="this team" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <SectionHeader title="Upcoming" />
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">{data?.schedule ? "No upcoming games listed." : "Schedule unavailable."}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {upcoming.map((g) => (
                    <li key={g.id}>
                      <Link href={`/games/${g.id}`} className="flex items-center justify-between gap-2 hover:underline">
                        <span className="flex items-center gap-2">
                          {g.homeAway === "away" ? "@" : "vs"} <TeamBadge id={g.opponent.id} /> {g.opponent.abbr}
                        </span>
                        <span className={cx("text-xs", g.state === "in" ? "font-semibold text-live" : "text-muted")}>{g.state === "in" ? "Live" : absTime(g.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <SectionHeader title="Recent results" />
              {recent.length === 0 ? (
                <p className="text-sm text-muted">{data?.schedule ? "No completed games yet." : "Schedule unavailable."}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {recent.map((g) => (
                    <li key={g.id}>
                      <Link href={`/games/${g.id}`} className="flex items-center justify-between gap-2 hover:underline">
                        <span className="flex items-center gap-2">
                          {g.homeAway === "away" ? "@" : "vs"} <TeamBadge id={g.opponent.id} /> {g.opponent.abbr}
                        </span>
                        <span className="tabular text-xs">
                          <span className={g.result === "W" ? "font-semibold text-ok" : "font-semibold text-live"}>{g.result}</span> {g.score}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <section>
            <SectionHeader title="Injuries & availability" right={<Link href="/injuries" className="text-xs text-muted underline">League tracker</Link>} />
            {!data?.injuries ? (
              <p className="text-sm text-muted">Injury source unavailable.</p>
            ) : injuries.length === 0 ? (
              <p className="text-sm text-muted">No players on the injury list.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
                {injuries.map((e) => (
                  <li key={e.playerName} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {e.playerId ? <Link href={`/players/${e.playerId}`} className="font-medium hover:underline">{e.playerName}</Link> : e.playerName}
                      <span className="ml-2 text-xs text-muted">{e.injury}</span>
                    </span>
                    <span className="text-xs">
                      <strong className={injurySeverity(e.status) >= 3 ? "text-live" : "text-warn"}>{e.status}</strong> · <TimeAgo iso={e.reportedAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-faint">Source: ESPN injury feed (compiled from team and league reports; not the league&apos;s official PDF report).</p>
          </section>

          <section>
            <SectionHeader title="Starting lineup" />
            <p className="mb-2 text-xs text-muted">Confirmed starters appear on the game page once a game starts. Before that, this shows who started the last game.</p>
            <LastStarters teamId={team.id} />
          </section>

          <section>
            <SectionHeader title="Roster" />
            {!data?.roster ? (
              <p className="text-sm text-muted">Roster unavailable.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-sm">
                  <caption className="sr-only">Official roster from the source</caption>
                  <thead className="text-[11px] uppercase text-faint">
                    <tr>
                      {["#", "Player", "Pos", "Ht", "Wt", "Age", "Exp", "Status"].map((h) => (
                        <th key={h} scope="col" className="px-2 py-1.5 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.roster.map((p) => (
                      <tr key={p.id} className="border-t border-line">
                        <td className="tabular px-2 py-1 text-faint">{p.jersey ?? ""}</td>
                        <td className="px-2">
                          <Link href={`/players/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-2">{p.position ?? "—"}</td>
                        <td className="whitespace-nowrap px-2">{p.height ?? "—"}</td>
                        <td className="whitespace-nowrap px-2">{p.weight ?? "—"}</td>
                        <td className="tabular px-2">{p.age ?? "—"}</td>
                        <td className="tabular px-2">{p.experience ?? "—"}</td>
                        <td className="px-2 text-xs text-warn">{p.injuryStatus ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <SectionHeader title="Fantasy implications" />
            {out.length === 0 ? (
              <p className="text-sm text-muted">No players listed as out or doubtful, so no obvious opportunity shifts right now.</p>
            ) : (
              <div className="rounded-lg border border-line bg-surface p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Analysis — not a team decision</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {out.map((e) => {
                    const pos = data?.roster?.find((r) => r.id === e.playerId)?.position;
                    const same = (data?.roster ?? []).filter((r) => r.id !== e.playerId && pos && r.position && r.position.slice(-1) === pos.slice(-1) && !r.injuryStatus);
                    return (
                      <li key={e.playerName}>
                        {e.playerName} is listed <strong>{e.status}</strong>.{" "}
                        {same.length > 0 ? (
                          <>
                            Healthy players at a similar position ({pos}):{" "}
                            {same.slice(0, 4).map((r, i) => (
                              <span key={r.id}>
                                {i > 0 && ", "}
                                <Link href={`/players/${r.id}`} className="underline">
                                  {r.name}
                                </Link>
                              </span>
                            ))}
                            . Check their recent minutes before assuming a bigger role.
                          </>
                        ) : (
                          "No obvious same-position replacement on the roster."
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <SectionHeader title="Team news" />
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto" role="group" aria-label="News category">
          {NEWS_TABS.map((t, i) => (
            <Chip key={t.label} active={newsTab === i} onClick={() => setNewsTab(i)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <RelatedStories teamIds={[team.id]} types={NEWS_TABS[newsTab].types} limit={15} empty="No stories in this category for this team." />
      </section>

      <StandingsTables highlight={team.id} />
    </div>
  );
}
