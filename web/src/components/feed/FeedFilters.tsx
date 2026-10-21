"use client";

import { useState } from "react";
import type { ContentType, SourceCategory } from "@/lib/types";
import { CONTENT_TYPES } from "@/lib/types";
import { DEFAULT_FILTER, type FeedFilter } from "@/lib/rank";
import { TEAMS, teamById } from "@/lib/teams";
import { CATEGORY_LABEL } from "@/lib/sources";
import { usePrefs } from "@/client/state";
import { usePlayerIndex } from "@/client/data";
import { Icon } from "../icons";
import { Chip, cx } from "../ui";

const TIME_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "Any time", hours: null },
  { label: "Last 3 hours", hours: 3 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 48 hours", hours: 48 },
  { label: "Last 7 days", hours: 168 },
];

const VERIF_OPTIONS: { v: FeedFilter["verification"]; label: string }[] = [
  { v: "all", label: "All reports" },
  { v: "official", label: "Official only" },
  { v: "credible", label: "Official + reported" },
  { v: "unconfirmed", label: "Unconfirmed & rumors" },
];

const SOURCE_CATS: SourceCategory[] = ["official", "national", "aggregator", "video"];

export function FeedFilters({ filter, onChange, lockTypes }: { filter: FeedFilter; onChange: (f: FeedFilter) => void; lockTypes?: boolean }) {
  const [open, setOpen] = useState(false);
  const prefs = usePrefs();
  const { byId } = usePlayerIndex();
  const set = (patch: Partial<FeedFilter>) => onChange({ ...filter, ...patch });
  const toggleType = (t: ContentType) => set({ types: filter.types.includes(t) ? filter.types.filter((x) => x !== t) : [...filter.types, t] });

  const active: { key: string; label: string; clear: () => void }[] = [];
  for (const t of filter.teamIds) active.push({ key: `t${t}`, label: teamById(t)?.name ?? t, clear: () => set({ teamIds: filter.teamIds.filter((x) => x !== t) }) });
  for (const p of filter.playerIds)
    active.push({ key: `p${p}`, label: byId.get(p)?.name ?? prefs.followedPlayers.find((x) => x.id === p)?.name ?? "Player", clear: () => set({ playerIds: filter.playerIds.filter((x) => x !== p) }) });
  if (filter.sinceHours != null) active.push({ key: "time", label: TIME_OPTIONS.find((o) => o.hours === filter.sinceHours)?.label ?? `Last ${filter.sinceHours}h`, clear: () => set({ sinceHours: null }) });
  if (filter.verification !== "all") active.push({ key: "v", label: VERIF_OPTIONS.find((o) => o.v === filter.verification)!.label, clear: () => set({ verification: "all" }) });
  for (const c of filter.sourceCategories) active.push({ key: `s${c}`, label: CATEGORY_LABEL[c], clear: () => set({ sourceCategories: filter.sourceCategories.filter((x) => x !== c) }) });
  if (filter.freshness !== "all") active.push({ key: "f", label: filter.freshness === "fresh" ? "Last 24h only" : "Archive (older than 24h)", clear: () => set({ freshness: "all" }) });

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        {!lockTypes && (
          // Full-width scrollable row on phones; shares the row with Filters/Sort on wider screens.
          <div className="no-scrollbar -mx-3 flex min-w-0 basis-full gap-1.5 overflow-x-auto px-3 md:mx-0 md:flex-1 md:basis-0 md:px-0" role="group" aria-label="Content type">
            <Chip active={filter.types.length === 0} onClick={() => set({ types: [] })}>
              All NBA
            </Chip>
            {CONTENT_TYPES.filter((t) => t.id !== "news").map((t) => (
              <Chip key={t.id} active={filter.types.includes(t.id)} onClick={() => toggleType(t.id)}>
                {t.label}
              </Chip>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="feed-filter-panel"
          className={cx("ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs", open || active.length ? "border-accent text-text" : "border-line text-muted")}
        >
          <Icon name="filter" size={14} /> Filters{active.length ? ` (${active.length})` : ""}
        </button>
        <label className="sr-only" htmlFor="feed-sort">
          Sort
        </label>
        <select
          id="feed-sort"
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as FeedFilter["sort"] })}
          className="shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-xs"
        >
          <option value="ranked">Most important</option>
          <option value="latest">Latest</option>
        </select>
      </div>

      {open && (
        <div id="feed-filter-panel" className="mt-3 grid gap-4 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <label htmlFor="ff-team" className="mb-1 block text-xs font-semibold text-muted">
              Teams
            </label>
            <select
              id="ff-team"
              value=""
              onChange={(e) => e.target.value && set({ teamIds: [...new Set([...filter.teamIds, e.target.value])] })}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              <option value="">Add a team…</option>
              {prefs.followedTeams.length > 0 && (
                <optgroup label="Following">
                  {prefs.followedTeams.map((id) => (
                    <option key={id} value={id}>
                      {teamById(id)?.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All teams">
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor="ff-player" className="mb-1 block text-xs font-semibold text-muted">
              Players
            </label>
            <select
              id="ff-player"
              value=""
              onChange={(e) => e.target.value && set({ playerIds: [...new Set([...filter.playerIds, e.target.value])] })}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              <option value="">{prefs.followedPlayers.length ? "Add a followed player…" : "Follow players to filter by them"}</option>
              {prefs.followedPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ff-time" className="mb-1 block text-xs font-semibold text-muted">
              Time range
            </label>
            <select
              id="ff-time"
              value={filter.sinceHours ?? ""}
              onChange={(e) => set({ sinceHours: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              {TIME_OPTIONS.map((o) => (
                <option key={o.label} value={o.hours ?? ""}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ff-verif" className="mb-1 block text-xs font-semibold text-muted">
              Verification
            </label>
            <select
              id="ff-verif"
              value={filter.verification}
              onChange={(e) => set({ verification: e.target.value as FeedFilter["verification"] })}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              {VERIF_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-muted">Source type</legend>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_CATS.map((c) => (
                <Chip
                  key={c}
                  active={filter.sourceCategories.includes(c)}
                  onClick={() => set({ sourceCategories: filter.sourceCategories.includes(c) ? filter.sourceCategories.filter((x) => x !== c) : [...filter.sourceCategories, c] })}
                >
                  {CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="ff-fresh" className="mb-1 block text-xs font-semibold text-muted">
              Live vs archive
            </label>
            <select
              id="ff-fresh"
              value={filter.freshness}
              onChange={(e) => set({ freshness: e.target.value as FeedFilter["freshness"] })}
              className="w-full rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              <option value="all">Everything</option>
              <option value="fresh">Last 24 hours</option>
              <option value="archive">Archive (older than 24 hours)</option>
            </select>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {active.map((a) => (
            <button
              key={a.key}
              onClick={a.clear}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-text hover:bg-surface-3"
              aria-label={`Remove filter ${a.label}`}
            >
              {a.label} <Icon name="x" size={12} />
            </button>
          ))}
          <button onClick={() => onChange({ ...DEFAULT_FILTER, types: lockTypes ? filter.types : [], sort: filter.sort })} className="text-xs text-muted underline hover:text-text">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
