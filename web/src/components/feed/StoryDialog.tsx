"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFeed, usePlayerIndex } from "@/client/data";
import { toggleSaved, useSaved } from "@/client/state";
import { VERIFICATION_HELP } from "@/lib/classify";
import { CATEGORY_LABEL } from "@/lib/sources";
import { Icon } from "../icons";
import { absTime, DemoBadge, TeamLink, TimeAgo, TypeBadge, VerificationBadge } from "../ui";
import { ReportTimeline } from "./StoryCard";
import { useStoryHref } from "./StoryLink";
import { VideoPlayer } from "./VideoPlayer";

// In-app story reader. Shows what can lawfully be shown — headline, the outlet's own summary,
// every report in the story with timestamps — and links to the full article at the source.

export function StoryDialog() {
  const params = useSearchParams();
  const id = params.get("story");
  const router = useRouter();
  const href = useStoryHref();
  const { data, isLoading } = useFeed();
  const saved = useSaved();
  const { byId } = usePlayerIndex();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const close = () => router.replace(href(null), { scroll: false });

  useEffect(() => {
    if (!id) return;
    lastFocus.current = document.activeElement as HTMLElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Keep Tab inside the dialog.
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("a[href],button,iframe,[tabindex='0']");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return null;
  const c = data?.clusters.find((x) => x.id === id);
  const snap = !c ? saved.find((s) => s.id === id) : null;
  const isSaved = saved.some((s) => s.id === id);
  const lead = c?.lead;
  const video = c?.items.find((i) => i.playback?.kind === "youtube") ?? (lead?.playback ? lead : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-title"
        className="relative min-h-dvh w-full max-w-2xl border-line bg-surface p-5 outline-none sm:min-h-0 sm:rounded-xl sm:border"
      >
        <button onClick={close} className="absolute right-3 top-3 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close story">
          <Icon name="x" />
        </button>

        {!c && !snap ? (
          <div className="py-10 text-center">
            <p id="story-title" className="font-medium">
              {isLoading ? "Loading story…" : "This story is no longer in the feed."}
            </p>
            {!isLoading && <p className="mt-1 text-sm text-muted">Stories age out of the feed after a while. Saved stories keep a copy in Saved.</p>}
          </div>
        ) : snap ? (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <TypeBadge t={snap.type} />
              {snap.demo && <DemoBadge />}
              <span className="text-xs text-faint">Saved copy · no longer in the live feed</span>
            </div>
            <h2 id="story-title" className="pr-8 text-xl font-semibold leading-snug">
              {snap.title}
            </h2>
            <p className="mt-3 text-muted">{snap.summary}</p>
            <p className="mt-3 text-xs text-faint">
              {snap.sourceName} · {absTime(snap.publishedAt)}
            </p>
            {snap.url && (
              <a href={snap.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline">
                Read the full article at {snap.sourceName} <Icon name="external" size={14} />
              </a>
            )}
          </div>
        ) : c && lead ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 pr-8">
              <TypeBadge t={c.type} />
              <VerificationBadge v={c.verification} />
              {lead.provenance.mode === "demo" && <DemoBadge />}
            </div>
            <h2 id="story-title" className="pr-8 text-xl font-semibold leading-snug">
              {lead.title}
            </h2>
            <p className="mt-1 text-xs text-faint">
              First reported <TimeAgo iso={c.firstPublishedAt} /> ({absTime(c.firstPublishedAt)})
              {c.lastUpdatedAt !== c.firstPublishedAt && (
                <>
                  {" "}
                  · latest update <TimeAgo iso={c.lastUpdatedAt} />
                </>
              )}
            </p>

            {video && (
              <div className="mt-4">
                <VideoPlayer item={video} />
              </div>
            )}

            {lead.summary && <p className="mt-4 leading-relaxed">{lead.summary}</p>}
            <p className="mt-2 text-xs text-faint">
              Summary text is the publisher&apos;s own description. {lead.byline ? `By ${lead.byline}.` : ""}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {lead.url && (
                <a href={lead.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black">
                  Read full article at {lead.sourceName} <Icon name="external" size={14} />
                </a>
              )}
              <button onClick={() => toggleSaved(c)} aria-pressed={isSaved} className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
                <Icon name="bookmark" size={14} fill={isSaved ? "currentColor" : "none"} /> {isSaved ? "Saved" : "Save"}
              </button>
            </div>

            <section className="mt-6 rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <h3 className="mb-1 font-semibold">How sure is this?</h3>
              <p className="text-muted">{VERIFICATION_HELP[c.verification]}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                <li>Original report (earliest non-aggregator): {c.originalSourceName ?? "unknown"}</li>
                {lead.citedOrigin && <li>Text credits: {lead.citedOrigin} (as cited by the outlet; not independently verified)</li>}
                <li>
                  Independent outlets: {c.independentSources.length ? c.independentSources.join(", ") : "none besides aggregators"}
                  {c.independentSources.length > 1 && c.verification !== "official" && " — several outlets reporting does not make it official."}
                </li>
              </ul>
            </section>

            {(c.teamIds.length > 0 || c.playerIds.length > 0) && (
              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Related</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  {c.teamIds.map((t) => (
                    <TeamLink key={t} id={t} showName className="rounded border border-line px-2 py-1" />
                  ))}
                  {c.playerIds
                    .map((p) => byId.get(p))
                    .filter((p): p is NonNullable<typeof p> => !!p)
                    .map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1">
                        <Link href={`/players/${p.id}`} className="hover:underline">
                          {p.name}
                        </Link>
                        <Link href={`/stats?players=${p.id}`} className="text-xs text-muted hover:text-text" aria-label={`Compare ${p.name}`}>
                          compare
                        </Link>
                      </span>
                    ))}
                  {c.type === "injury" && (
                    <Link href="/injuries" className="rounded border border-line px-2 py-1 text-muted hover:text-text">
                      Injury tracker
                    </Link>
                  )}
                </div>
              </section>
            )}

            <section className="mt-5">
              <h3 className="text-sm font-semibold">Timeline ({c.items.length} report{c.items.length > 1 ? "s" : ""})</h3>
              <ReportTimeline items={c.items} />
            </section>

            <details className="mt-5 text-xs text-faint">
              <summary className="cursor-pointer">Provenance</summary>
              <ul className="mt-1 space-y-0.5">
                {c.items.map((i) => (
                  <li key={i.id}>
                    {i.sourceName} ({CATEGORY_LABEL[i.sourceCategory]}) via {i.provenance.provider}, {i.provenance.mode}
                    {i.provenance.fetchedAt ? `, fetched ${absTime(i.provenance.fetchedAt)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
