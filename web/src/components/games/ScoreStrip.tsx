"use client";

import Link from "next/link";
import { useScoreboard } from "@/client/data";
import { DataStatus, Skeleton } from "../ui";
import { GameCard } from "./GameCard";

/** Compact scoreboard at the top of the home feed. */
export function ScoreStrip() {
  const { data, meta, error, isLoading } = useScoreboard();
  const games = data?.games ?? [];
  return (
    <section aria-label="Today's scoreboard" className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          <Link href="/games" className="hover:underline">
            Today
          </Link>
        </h2>
        <DataStatus meta={meta} />
      </div>
      {isLoading ? (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] w-40 shrink-0" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-muted">Scoreboard unavailable: {error.message}</p>
      ) : !data?.games ? (
        <p className="text-sm text-muted">The scoreboard source can&apos;t be reached right now.</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">
          No games today. <Link href="/games" className="underline">See the schedule</Link>.
        </p>
      ) : (
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0">
          {games.map((g) => (
            <GameCard key={g.id} g={g} className="w-40 shrink-0" />
          ))}
        </div>
      )}
    </section>
  );
}
