"use client";

import Link from "next/link";
import { savedStore, togglePlayer, toggleTeam, updatePrefs, usePrefs, useSaved } from "@/client/state";
import { teamById } from "@/lib/teams";
import { Icon } from "@/components/icons";
import { StoryLink } from "@/components/feed/StoryLink";
import { Card, DemoBadge, EmptyState, SectionHeader, TeamBadge, TimeAgo, typeLabel } from "@/components/ui";

export default function SavedPage() {
  const saved = useSaved();
  const prefs = usePrefs();
  return (
    <div className="space-y-6">
      <SectionHeader as="h1" title="Saved & watchlist" />
      {!savedStore.persistent() && (
        <p role="alert" className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          This browser is blocking local storage (private mode?), so saved items will be lost when you close the tab.
        </p>
      )}
      <section>
        <SectionHeader title={`Saved stories (${saved.length})`} />
        {saved.length === 0 ? (
          <EmptyState title="Nothing saved yet" icon="bookmark">Use Save on any story. A copy of the headline, summary and link is kept even after the story leaves the feed.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {saved.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {typeLabel(s.type)} {s.demo && <DemoBadge />}
                  </p>
                  <StoryLink id={s.id} className="font-medium hover:underline">
                    {s.title}
                  </StoryLink>
                  <p className="text-xs text-faint">
                    {s.sourceName} · <TimeAgo iso={s.publishedAt} /> · saved <TimeAgo iso={s.savedAt} />
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.title} at ${s.sourceName}`} className="rounded p-1.5 text-muted hover:text-text">
                      <Icon name="external" size={16} />
                    </a>
                  )}
                  <button onClick={() => savedStore.set((l) => l.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.title} from saved`} className="rounded p-1.5 text-muted hover:text-text">
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <SectionHeader title="Followed teams" right={<Link href="/teams" className="text-xs text-muted underline">Add teams</Link>} />
          {prefs.followedTeams.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {prefs.followedTeams.map((id) => (
                <li key={id} className="flex items-center justify-between text-sm">
                  <Link href={`/teams/${id}`} className="flex items-center gap-2 hover:underline">
                    <TeamBadge id={id} /> {teamById(id)?.name}
                  </Link>
                  <button onClick={() => toggleTeam(id)} className="text-xs text-muted hover:text-text">
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <SectionHeader title="Player watchlist" right={<Link href="/players" className="text-xs text-muted underline">Add players</Link>} />
          {prefs.followedPlayers.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {prefs.followedPlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <Link href={`/players/${p.id}`} className="flex items-center gap-2 hover:underline">
                    <TeamBadge id={p.teamId} /> {p.name}
                  </Link>
                  <button onClick={() => togglePlayer(p)} className="text-xs text-muted hover:text-text">
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader title="Saved searches" />
        {prefs.savedSearches.length === 0 ? (
          <p className="text-sm text-muted">Save a search from the search results page.</p>
        ) : (
          <ul className="space-y-1">
            {prefs.savedSearches.map((s) => (
              <li key={s} className="flex items-center justify-between text-sm">
                <Link href={`/search?q=${encodeURIComponent(s)}`} className="hover:underline">
                  {s}
                </Link>
                <button onClick={() => updatePrefs((p) => ({ savedSearches: p.savedSearches.filter((x) => x !== s) }))} className="text-xs text-muted hover:text-text">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
