"use client";

import { useMemo } from "react";
import type { Game, GameDetail, InjuryEntry, PlayerBio, PlayerStats, RosterPlayer, ScheduleGame, StandingRow, StoryCluster } from "@/lib/types";
import { useApi } from "./api";

// Shared data hooks. Refresh intervals match how fast each source actually changes.

export function useFeed() {
  return useApi<{ clusters: StoryCluster[] }>("/api/feed", { refreshInterval: 120_000, revalidateOnFocus: true });
}

export function usePlayerIndex() {
  const r = useApi<{ players: RosterPlayer[] }>("/api/players", { refreshInterval: 0, revalidateIfStale: false });
  const byId = useMemo(() => new Map((r.data?.players ?? []).map((p) => [p.id, p])), [r.data]);
  return { ...r, byId };
}

export function useScoreboard(date?: string) {
  const key = `/api/scoreboard${date ? `?date=${date}` : ""}`;
  // Poll fast only while a game is live.
  const r = useApi<{ date: string; games: Game[] | null }>(key, {
    refreshInterval: (latest) => (latest?.data?.games?.some((g: Game) => g.state === "in") ? 30_000 : 5 * 60_000),
  });
  return r;
}

export function useGame(id: string | null) {
  return useApi<GameDetail | null>(id ? `/api/games/${id}` : null, {
    refreshInterval: (latest) => (latest?.data?.game.state === "in" ? 30_000 : 0),
  });
}

export function useInjuries() {
  return useApi<{ injuries: InjuryEntry[] | null }>("/api/injuries", { refreshInterval: 5 * 60_000 });
}

export function useStandings() {
  return useApi<{ standings: StandingRow[] | null }>("/api/standings", { refreshInterval: 30 * 60_000 });
}

export interface PlayerPayload {
  bio: PlayerBio | null;
  stats: PlayerStats | null;
  injury: InjuryEntry | null;
  schedule: ScheduleGame[] | null;
  season: number;
  currentSeason: number;
}

export function usePlayer(id: string | null, season?: number) {
  return useApi<PlayerPayload>(id ? `/api/players/${id}${season ? `?season=${season}` : ""}` : null);
}

export interface TeamPayload {
  roster: RosterPlayer[] | null;
  schedule: ScheduleGame[] | null;
  standing: StandingRow | null;
  injuries: InjuryEntry[] | null;
}

export function useTeam(id: string) {
  return useApi<TeamPayload>(`/api/teams/${id}`, { refreshInterval: 5 * 60_000 });
}
