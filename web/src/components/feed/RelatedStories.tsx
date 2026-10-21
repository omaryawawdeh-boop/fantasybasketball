"use client";

import type { ContentType } from "@/lib/types";
import { useFeed } from "@/client/data";
import { EmptyState, LoadingList } from "../ui";
import { StoryCard } from "./StoryCard";

/** A short list of stories about given teams/players, newest first. */
export function RelatedStories({ teamIds = [], playerIds = [], types, limit = 6, empty = "No recent stories." }: { teamIds?: string[]; playerIds?: string[]; types?: ContentType[]; limit?: number; empty?: string }) {
  const { data, isLoading } = useFeed();
  // Cheap enough to recompute each render (a few hundred stories at most).
  const list = (data?.clusters ?? [])
        .filter((c) => (playerIds.length ? c.playerIds.some((p) => playerIds.includes(p)) : true) && (teamIds.length ? c.teamIds.some((t) => teamIds.includes(t)) : true))
        .filter((c) => !types || types.includes(c.type) || c.tags.some((t) => types.includes(t)))
        .sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt))
    .slice(0, limit);
  if (isLoading) return <LoadingList rows={2} />;
  if (!list.length) return <EmptyState title={empty} />;
  return (
    <div className="space-y-3">
      {list.map((c) => (
        <StoryCard key={c.id} cluster={c} />
      ))}
    </div>
  );
}
