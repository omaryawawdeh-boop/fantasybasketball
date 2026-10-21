"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import type { ContentItem, StoryCluster } from "@/lib/types";
import { toggleSaved, updatePrefs, usePrefs, useSaved } from "@/client/state";
import { usePlayerIndex } from "@/client/data";
import { Icon } from "../icons";
import { cx, DemoBadge, SafeImg, TeamLink, TimeAgo, TypeBadge, typeLabel, VerificationBadge } from "../ui";
import { VideoPlayer } from "./VideoPlayer";
import { StoryLink } from "./StoryLink";

export interface StoryCardProps {
  cluster: StoryCluster;
  reasons?: string[];
  breaking?: boolean;
  featured?: boolean;
}

function StoryCardImpl({ cluster: c, reasons = [], breaking, featured }: StoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const saved = useSaved().some((s) => s.id === c.id);
  const prefs = usePrefs();
  const { byId } = usePlayerIndex();
  const lead = c.lead;
  const demo = lead.provenance.mode === "demo";
  const video = c.items.find((i) => i.playback?.kind === "youtube") ?? (lead.playback ? lead : null);
  const others = c.items.length - 1;
  const players = c.playerIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 4);
  const updated = Date.parse(c.lastUpdatedAt) - Date.parse(c.firstPublishedAt) > 10 * 60_000;

  return (
    <article
      aria-labelledby={`t-${c.id}`}
      className={cx("rounded-lg border bg-surface p-4", breaking ? "border-live/50" : "border-line", featured && "md:p-5")}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {breaking && <span className="rounded bg-live px-1.5 py-px text-[11px] font-bold uppercase tracking-wider text-white">Breaking</span>}
        <TypeBadge t={c.type} />
        <VerificationBadge v={c.verification} />
        {demo && <DemoBadge />}
        {reasons.length > 0 && <span className="text-[11px] text-faint">· {reasons.slice(0, 2).join(" · ")}</span>}
      </div>

      <h3 id={`t-${c.id}`} className={cx("font-semibold leading-snug", featured ? "text-lg md:text-xl" : "text-[15px]")}>
        <StoryLink id={c.id} className="hover:underline">
          {lead.title}
        </StoryLink>
      </h3>

      {video && <div className="mt-3">{<VideoPlayer item={video} />}</div>}
      {!video && prefs.publisherImages && lead.thumbnail && (
        <SafeImg src={lead.thumbnail} alt="" className="mt-3 aspect-[16/9] w-full rounded-md object-cover" />
      )}

      {lead.summary && <p className={cx("mt-2 text-sm text-muted", !featured && "line-clamp-2")}>{lead.summary}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
        <span className="font-medium text-muted">{lead.sourceName}</span>
        {c.originalSourceName && c.originalSourceName !== lead.sourceName && <span>· first: {c.originalSourceName}</span>}
        {lead.citedOrigin && <span>· credits {lead.citedOrigin}</span>}
        <span>
          · <TimeAgo iso={c.firstPublishedAt} />
        </span>
        {updated && (
          <span className="text-text/80">
            · updated <TimeAgo iso={c.lastUpdatedAt} />
          </span>
        )}
        {c.independentSources.length > 1 && <span>· {c.independentSources.length} outlets</span>}
      </div>

      {(c.teamIds.length > 0 || players.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {c.teamIds.slice(0, 3).map((t) => (
            <TeamLink key={t} id={t} />
          ))}
          {players.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-text">
              {p.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => toggleSaved(c)}
          aria-pressed={saved}
          className={cx("inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2", saved ? "text-accent" : "text-muted")}
        >
          <Icon name="bookmark" size={14} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}
        </button>
        {others > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`r-${c.id}`}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-2"
          >
            <Icon name="chevronDown" size={14} className={cx("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} {others} more report{others > 1 ? "s" : ""}
          </button>
        )}
        <StoryLink id={c.id} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-2">
          Details
        </StoryLink>
        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-label="More actions"
            className="rounded px-2 py-1 text-muted hover:bg-surface-2"
          >
            <Icon name="more" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface-2 p-1 text-sm shadow-lg">
              {lead.url && (
                <a role="menuitem" href={lead.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-3">
                  <Icon name="external" size={14} /> Open at {lead.sourceName}
                </a>
              )}
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-3"
                onClick={() => {
                  updatePrefs((p) => ({ mutedTypes: [...new Set([...p.mutedTypes, c.type])] }));
                  setMenu(false);
                }}
              >
                <Icon name="eyeOff" size={14} /> Mute “{typeLabel(c.type)}” stories
              </button>
              {[...new Set(c.items.map((i) => i.sourceId))].map((sid) => {
                const name = c.items.find((i) => i.sourceId === sid)!.sourceName;
                return (
                  <button
                    key={sid}
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-3"
                    onClick={() => {
                      updatePrefs((p) => ({ hiddenSources: [...new Set([...p.hiddenSources, sid])] }));
                      setMenu(false);
                    }}
                  >
                    <Icon name="eyeOff" size={14} /> Hide source: {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div id={`r-${c.id}`}>
          <ReportTimeline items={c.items} />
        </div>
      )}
    </article>
  );
}

export const StoryCard = memo(StoryCardImpl);

/** Every report in a story, oldest first, with its own time, source and verification. */
export function ReportTimeline({ items }: { items: ContentItem[] }) {
  return (
    <ol className="mt-3 space-y-3 border-l border-line pl-4">
      {items.map((i) => (
        <li key={i.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-faint" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
            <TimeAgo iso={i.publishedAt} />
            <span className="font-medium text-muted">{i.sourceName}</span>
            <VerificationBadge v={i.verification} />
            {i.sourceCategory === "aggregator" && <span title="This outlet usually repeats other outlets' reports.">aggregator</span>}
          </div>
          <p className="mt-0.5">{i.title}</p>
          {i.summary && <p className="text-xs text-muted">{i.summary}</p>}
          {i.url && (
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs underline text-muted hover:text-text">
              Read at {i.sourceName} <Icon name="external" size={11} />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
