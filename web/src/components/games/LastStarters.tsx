"use client";

import Link from "next/link";
import { useGame, useTeam } from "@/client/data";
import { Card, TeamBadge } from "../ui";

/** Before tip-off: each team's starters from its most recent game, clearly labeled as such. */
export function LastStarters({ teamId }: { teamId: string }) {
  const team = useTeam(teamId);
  const last = [...(team.data?.schedule ?? [])].filter((g) => g.state === "post").pop();
  const game = useGame(last?.id ?? null);
  const starters = last && game.data ? game.data.box.find((b) => b.team.id === teamId)?.players.filter((p) => p.starter) ?? [] : [];
  return (
    <Card className="p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <TeamBadge id={teamId} /> Not yet confirmed
      </div>
      {!last ? (
        <p className="text-muted">No previous game found this season.</p>
      ) : starters.length === 0 ? (
        <p className="text-muted">{game.isLoading ? "Loading last game…" : "Last game's starters unavailable."}</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Started last game ({new Date(last.date).toLocaleDateString()} vs {last.opponent.abbr}) — not a projection for tonight:
          </p>
          <ul className="mt-1">
            {starters.map((p) => (
              <li key={p.playerId}>
                <Link href={`/players/${p.playerId}`} className="hover:underline">
                  {p.name}
                </Link>{" "}
                <span className="text-faint">{p.position}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
