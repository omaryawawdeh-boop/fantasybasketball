"use client";

import { useState } from "react";
import type { ContentItem } from "@/lib/types";
import { Icon } from "../icons";
import { SafeImg } from "../ui";

// Click-to-play video. Nothing from YouTube's player loads until the user presses play
// (privacy + performance: no dozens of iframes in the feed). Only sources that permit embedding
// get a player; everything else gets an honest message and a clearly labeled external link.

export function youtubeEmbedUrl(videoId: string): string | null {
  if (!/^[\w-]{6,20}$/.test(videoId)) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
}

export function VideoPlayer({ item }: { item: ContentItem }) {
  const [playing, setPlaying] = useState(false);
  const pb = item.playback;
  if (!pb) return null;

  if (pb.kind === "youtube" && pb.embeddable !== false) {
    const src = youtubeEmbedUrl(pb.videoId);
    if (!src) return <Unavailable item={item} reason="This video id looks invalid." />;
    return (
      <div>
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          {playing ? (
            <iframe
              src={src}
              title={item.title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 h-full w-full" aria-label={`Play video: ${item.title}`}>
              <SafeImg src={item.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:opacity-100" />
              <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white group-hover:bg-accent group-focus-visible:bg-accent">
                <Icon name="play" size={24} />
              </span>
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-faint">
          Plays via YouTube{pb.embeddable == null ? " — if the player says “Video unavailable”, the uploader has blocked playback in other apps" : ""}.{" "}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
              Watch on YouTube
            </a>
          )}
        </p>
      </div>
    );
  }

  if (pb.kind === "youtube") return <Unavailable item={item} reason="The uploader doesn't allow this video to be played outside YouTube." />;
  return <Unavailable item={item} reason={pb.reason} />;
}

function Unavailable({ item, reason }: { item: ContentItem; reason: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-surface-2 p-3 text-sm">
      <Icon name="video" className="mt-0.5 shrink-0 text-faint" />
      <div>
        <p className="text-muted">{reason}</p>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline">
            Watch at {item.sourceName} (opens new tab) <Icon name="external" size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
