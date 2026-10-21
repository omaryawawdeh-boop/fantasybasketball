import type { ContentItem } from "@/lib/types";

let n = 0;
/** Builds a ContentItem with sensible defaults for tests. */
export function item(p: Partial<ContentItem> & { title: string }): ContentItem {
  n++;
  return {
    id: p.id ?? `t${n}`,
    summary: "",
    type: "news",
    tags: [],
    playerIds: [],
    teamIds: [],
    gameIds: [],
    publishedAt: new Date(Date.UTC(2026, 9, 20, 12, 0)).toISOString(),
    updatedAt: null,
    sourceId: "espn-api",
    sourceName: "ESPN",
    sourceCategory: "national",
    url: `https://example.com/${n}`,
    verification: "reported",
    citedOrigin: null,
    thumbnail: null,
    playback: null,
    byline: null,
    provenance: { provider: "test", mode: "live", fetchedAt: null },
    ...p,
  };
}

export const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h, 0)).toISOString();
