"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { BoxTeam, Game } from "@/lib/types";
import { useGame } from "@/client/data";
import { LastStarters } from "@/components/games/LastStarters";
import { StatusLabel } from "@/components/games/GameCard";
import { RelatedStories } from "@/components/feed/RelatedStories";
import { absTime, Card, DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, SectionHeader, TeamBadge } from "@/components/ui";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { data, meta, error, isLoading, mutate } = useGame(id);
  if (isLoading) return <LoadingList rows={3} label="Loading game" />;
  if (error) return <ErrorState error={error} onRetry={() => mutate()} what="this game" />;
  if (!data) return <EmptyState title="Game details unavailable" icon="alert">The box score source couldn&apos;t be reached or doesn&apos;t have this game.</EmptyState>;
  const { game: g, box, startersConfirmed } = data;
  return (
    <div className="space-y-6">
      <DemoNotice meta={meta} />
      <Header g={g} meta={meta} />
      {g.home.linescores.length > 0 && <Linescore g={g} />}
      <section>
        <SectionHeader title="Starting lineups" />
        {startersConfirmed ? (
          <p className="mb-2 text-sm text-muted">Confirmed: marked as starters in the box score.</p>
        ) : g.state === "pre" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <LastStarters teamId={g.away.id} />
            <LastStarters teamId={g.home.id} />
          </div>
        ) : (
          <p className="text-sm text-muted">Starters are not marked in the source for this game.</p>
        )}
      </section>
      {box.length > 0 ? (
        box.map((t) => <BoxTable key={t.team.id} t={t} />)
      ) : (
        g.state !== "pre" && <EmptyState title="No box score yet" />
      )}
      <section>
        <SectionHeader title="Related stories" />
        <RelatedStories teamIds={[g.home.id, g.away.id]} limit={5} empty="No recent stories about these teams." />
      </section>
    </div>
  );
}

function Header({ g, meta }: { g: Game; meta: Parameters<typeof DataStatus>[0]["meta"] }) {
  const side = (t: Game["home"]) => (
    <Link href={`/teams/${t.id}`} className="flex flex-col items-center gap-1 hover:underline">
      <TeamBadge id={t.id} abbr={t.abbr} size="lg" />
      <span className="text-sm font-medium">{t.name}</span>
      {t.record && <span className="text-xs text-faint">{t.record}</span>}
    </Link>
  );
  return (
    <Card className="p-5">
      <h1 className="sr-only">
        {g.away.name} at {g.home.name}
      </h1>
      <div className="flex items-center justify-around gap-4">
        {side(g.away)}
        <div className="text-center">
          {g.state === "pre" ? (
            <p className="text-sm text-muted">{absTime(g.date)}</p>
          ) : (
            <p className="tabular text-3xl font-bold">
              {g.away.score ?? "–"} <span className="text-faint">–</span> {g.home.score ?? "–"}
            </p>
          )}
          <p className="mt-1 text-sm">
            <StatusLabel g={g} />
          </p>
          {g.venue && <p className="mt-1 text-xs text-faint">{g.venue}</p>}
          {g.broadcasts.length > 0 && <p className="text-xs text-faint">TV: {g.broadcasts.join(", ")}</p>}
        </div>
        {side(g.home)}
      </div>
      <div className="mt-3 text-right">
        <DataStatus meta={meta} />
      </div>
    </Card>
  );
}

function Linescore({ g }: { g: Game }) {
  const n = Math.max(g.home.linescores.length, g.away.linescores.length);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">Score by period</caption>
        <thead className="text-[11px] uppercase text-faint">
          <tr>
            <th scope="col" className="px-3 py-1.5 text-left">Team</th>
            {Array.from({ length: n }, (_, i) => (
              <th scope="col" key={i} className="px-2 text-right">
                {i < 4 ? `Q${i + 1}` : `OT${i - 3}`}
              </th>
            ))}
            <th scope="col" className="px-3 text-right">T</th>
          </tr>
        </thead>
        <tbody>
          {[g.away, g.home].map((t) => (
            <tr key={t.id} className="border-t border-line">
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                {t.abbr}
              </th>
              {Array.from({ length: n }, (_, i) => (
                <td key={i} className="tabular px-2 text-right">
                  {t.linescores[i] ?? "–"}
                </td>
              ))}
              <td className="tabular px-3 text-right font-semibold">{t.score ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTable({ t }: { t: BoxTeam }) {
  const played = t.players.filter((p) => !p.didNotPlay).sort((a, b) => Number(b.starter) - Number(a.starter));
  const dnp = t.players.filter((p) => p.didNotPlay);
  const cols = t.labels.filter((l) => l);
  return (
    <section>
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            <TeamBadge id={t.team.id} /> {t.team.name} box score
          </span>
        }
      />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-faint">
            <tr>
              <th scope="col" className="sticky left-0 bg-surface px-3 py-1.5 text-left">Player</th>
              {cols.map((l) => (
                <th scope="col" key={l} className="px-2 text-right">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {played.map((p) => (
              <tr key={p.playerId} className="border-t border-line">
                <th scope="row" className="sticky left-0 whitespace-nowrap bg-surface px-3 py-1.5 text-left font-normal">
                  <Link href={`/players/${p.playerId}`} className="hover:underline">
                    {p.name}
                  </Link>
                  <span className="ml-1 text-[11px] text-faint">
                    {p.position}
                    {p.starter ? " · S" : ""}
                  </span>
                </th>
                {cols.map((l) => (
                  <td key={l} className="tabular whitespace-nowrap px-2 text-right">
                    {p.stats[l] ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dnp.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Did not play:{" "}
          {dnp.map((p, i) => (
            <span key={p.playerId}>
              {i > 0 && ", "}
              <Link href={`/players/${p.playerId}`} className="hover:underline">
                {p.name}
              </Link>
              {p.dnpReason ? ` (${p.dnpReason})` : ""}
            </span>
          ))}
        </p>
      )}
      <p className="mt-1 text-[11px] text-faint">S = starter. Source: ESPN box score.</p>
    </section>
  );
}
