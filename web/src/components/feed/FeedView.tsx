"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoryCluster } from "@/lib/types";
import { buildFeed, DEFAULT_FILTER, type FeedFilter } from "@/lib/rank";
import { useFeed } from "@/client/data";
import { rankPrefsFrom, usePrefs, useSaved } from "@/client/state";
import { DataStatus, DemoNotice, EmptyState, ErrorState, LoadingList, useNow } from "../ui";
import { FeedFilters } from "./FeedFilters";
import { StoryCard } from "./StoryCard";

const PAGE = 15;

export interface FeedViewProps {
  initial?: Partial<FeedFilter>;
  /** Hide the type chips (e.g. on the Highlights page where the type is fixed). */
  lockTypes?: boolean;
  /** Feature the top story with a larger card. */
  featureTop?: boolean;
  grid?: boolean;
  emptyText?: string;
}

export function FeedView({ initial, lockTypes, featureTop, grid, emptyText }: FeedViewProps) {
  const [filter, setFilter] = useState<FeedFilter>({ ...DEFAULT_FILTER, ...initial });
  const { data, meta, error, isLoading, mutate } = useFeed();
  const prefs = usePrefs();
  const saved = useSaved();
  const now = useNow(60_000);

  // Hold the list the user is reading steady: when fresh data arrives while they're scrolled
  // down, offer it instead of re-ordering cards under their cursor.
  const [shown, setShown] = useState<StoryCluster[] | null>(null);
  const [pending, setPending] = useState<StoryCluster[] | null>(null);
  const [seen, setSeen] = useState<StoryCluster[] | null>(null);
  // Derived-state update during render (React's recommended alternative to an effect).
  if (data && data.clusters !== seen) {
    setSeen(data.clusters);
    const scrolled = typeof window !== "undefined" && window.scrollY >= 300;
    const known = new Set((shown ?? []).map((c) => c.id));
    if (shown && scrolled && data.clusters.some((c) => !known.has(c.id))) {
      setPending(data.clusters);
    } else {
      setShown(data.clusters);
      setPending(null);
    }
  }

  const rankPrefs = useMemo(() => rankPrefsFrom(prefs, saved), [prefs, saved]);
  const ranked = useMemo(() => (shown ? buildFeed(shown, filter, rankPrefs, now) : []), [shown, filter, rankPrefs, now]);

  // Page size resets whenever the filter changes.
  const [paging, setPaging] = useState({ filter, count: PAGE });
  const count = paging.filter === filter ? paging.count : PAGE;
  const setCount = (f: (c: number) => number) => setPaging((p) => ({ filter, count: f(p.filter === filter ? p.count : PAGE) }));
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setPaging((p) => ({ filter, count: (p.filter === filter ? p.count : PAGE) + PAGE })),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ranked.length, filter]);

  const newCount = pending ? pending.filter((c) => !shown?.some((s) => s.id === c.id)).length : 0;
  const visible = ranked.slice(0, count);

  return (
    <div>
      <DemoNotice meta={meta} />
      <FeedFilters filter={filter} onChange={setFilter} lockTypes={lockTypes} />
      <div className="mb-2 flex items-center justify-between text-xs text-faint">
        <span aria-live="polite">{shown ? `${ranked.length} ${ranked.length === 1 ? "story" : "stories"}` : ""}</span>
        <DataStatus meta={meta} />
      </div>
      {pending && newCount > 0 && (
        <button
          onClick={() => {
            setShown(pending);
            setPending(null);
            window.scrollTo({ top: 0 });
          }}
          className="sticky top-16 z-10 mx-auto mb-3 block rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-black shadow"
        >
          {newCount} new {newCount === 1 ? "story" : "stories"} — show
        </button>
      )}
      {isLoading && !shown ? (
        <LoadingList rows={5} label="Loading stories" />
      ) : error && !shown ? (
        <ErrorState error={error} onRetry={() => mutate()} what="the news feed" />
      ) : ranked.length === 0 ? (
        <EmptyState title="No stories match" icon="filter">
          {emptyText ?? "Try a wider time range or remove a filter."}
          {(prefs.mutedTypes.length > 0 || prefs.hiddenSources.length > 0 || prefs.mutedKeywords.length > 0) && (
            <span className="block">Some stories are hidden by your mutes in Settings.</span>
          )}
        </EmptyState>
      ) : (
        <div className={grid ? "grid gap-4 sm:grid-cols-2" : "space-y-3"}>
          {visible.map((r, i) => (
            <StoryCard key={r.cluster.id} cluster={r.cluster} reasons={r.reasons} breaking={r.breaking} featured={featureTop && i === 0 && !grid} />
          ))}
        </div>
      )}
      {count < ranked.length && (
        <div ref={sentinel} className="mt-4 text-center">
          <button onClick={() => setCount((c) => c + PAGE)} className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text">
            Load more
          </button>
        </div>
      )}
      {error && shown && (
        <p className="mt-3 text-xs text-warn" role="status">
          Couldn&apos;t refresh ({error.message}). Showing the last loaded stories — they may be out of date.
        </p>
      )}
    </div>
  );
}
